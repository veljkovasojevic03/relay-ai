/**
 * Retrieval eval (spec §12): `pnpm eval:retrieval`.
 *
 * Runs against the LOCAL Supabase stack only (DB + the `embed` Edge Function), through the
 * real `match_faqs` and `decideAnswer`, so the numbers describe what the app does. It
 * creates a throwaway owner with the Kroj demo FAQs, measures several configurations,
 * writes docs/RETRIEVAL_REPORT.md and deletes the owner again.
 *
 *   pnpm eval:retrieval            # measure and write the report
 *   pnpm eval:retrieval --no-write # print only
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import demoFaqs from "../src/lib/demo/kroj-faqs.json" with { type: "json" };
import { EmbedError, embedTexts, toPgVector } from "../src/lib/faqs/embed";
import {
  decideAnswer,
  MATCH_COUNT,
  RETRIEVAL,
  toFaqMatch,
  type FaqMatch,
  type MatchRow,
  type RetrievalSettings,
} from "../src/lib/faqs/retrieval";
import { faqEmbeddingText, normalizeForSearch, queryEmbeddingText } from "../src/lib/faqs/text";
import { localSupabaseEnv } from "./local-supabase.mjs";

type Language = "en" | "sr";
type GoldenQuery = { language: Language; query: string; expected: string | null; tags: string[] };
type DemoFaq = { key: string; language: Language; question: string; answer: string };
type Result = { q: GoldenQuery; matches: FaqMatch[]; keys: (string | null)[] };
type Run = { variant: EmbeddingVariant; hybrid: boolean; results: Result[] };

/** How FAQs and queries become embedding input. The first one is what the app ships. */
const EMBEDDINGS = {
  "question, normalized": {
    faq: (f: DemoFaq) => faqEmbeddingText(f),
    query: (q: string) => queryEmbeddingText(q),
  },
  "question, raw": { faq: (f: DemoFaq) => f.question.trim(), query: (q: string) => q.trim() },
  "question + answer, normalized": {
    faq: (f: DemoFaq) => normalizeForSearch(`${f.question} ${f.answer}`),
    query: (q: string) => queryEmbeddingText(q),
  },
} as const;
type EmbeddingVariant = keyof typeof EMBEDDINGS;
const SHIPPED: EmbeddingVariant = "question, normalized";
const LANGUAGES = ["en", "sr"] as const;
const TARGET_TOP1: Record<Language, number> = { en: 0.85, sr: 0.7 };
const MAX_FALSE_ACCEPT = 0.1;

const write = !process.argv.includes("--no-write");
const env = localSupabaseEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const embedConfig = {
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  secretKey: env.SUPABASE_SERVICE_ROLE_KEY,
  // The first call after the stack starts may load the model.
  timeoutMs: 180_000,
};

const golden = (
  JSON.parse(readFileSync(resolve("eval/faq-retrieval.json"), "utf8")) as {
    queries: GoldenQuery[];
  }
).queries;
const faqs = demoFaqs as DemoFaq[];

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const fmt = (s: RetrievalSettings) =>
  `${s.hybrid ? "hybrid" : "vector only"}, threshold ${s.threshold}, corroborated ${s.corroboratedThreshold} at ≥ ${s.minOverlap * 100}% keyword overlap`;

async function setup() {
  const { data: user, error } = await admin.auth.admin.createUser({
    email: `eval-${randomUUID()}@relay.test`,
    password: randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (error || !user.user) throw error ?? new Error("createUser failed");
  const ownerId = user.user.id;

  try {
    const bot = await admin
      .from("bots")
      .insert({ owner_id: ownerId, name: "Kroj (eval)" })
      .select("id")
      .single();
    if (bot.error) throw bot.error;

    const inserted = await admin
      .from("faqs")
      .insert(
        faqs.map((f) => ({
          bot_id: bot.data.id,
          question: f.question,
          answer: f.answer,
          language: f.language,
        })),
      )
      .select("id, question, language");
    if (inserted.error) throw inserted.error;

    const keyById = new Map<string, string>();
    const idByFaq = new Map<DemoFaq, string>();
    for (const f of faqs) {
      const row = inserted.data.find((r) => r.question === f.question && r.language === f.language);
      if (!row) throw new Error(`FAQ not inserted: ${f.key}/${f.language}`);
      keyById.set(row.id, f.key);
      idByFaq.set(f, row.id);
    }
    return { ownerId, botId: bot.data.id as string, keyById, idByFaq };
  } catch (setupError) {
    await admin.auth.admin.deleteUser(ownerId);
    throw setupError;
  }
}

async function indexFaqs(variant: EmbeddingVariant, idByFaq: Map<DemoFaq, string>) {
  const vectors = await embedTexts(faqs.map(EMBEDDINGS[variant].faq), embedConfig);
  await Promise.all(
    faqs.map(async (f, i) => {
      const { error } = await admin
        .from("faqs")
        .update({ embedding: toPgVector(vectors[i]!), embedding_status: "ready" })
        .eq("id", idByFaq.get(f)!);
      if (error) throw error;
    }),
  );
}

async function runQueries(
  botId: string,
  keyById: Map<string, string>,
  vectors: number[][],
  hybrid: boolean,
): Promise<Result[]> {
  return Promise.all(
    golden.map(async (q, i) => {
      const { data, error } = await admin.rpc("match_faqs", {
        p_bot_id: botId,
        p_query_embedding: toPgVector(vectors[i]!),
        p_query_text: q.query,
        p_k: MATCH_COUNT,
        p_hybrid: hybrid,
        p_language: q.language,
      });
      if (error) throw error;
      const matches = (data as MatchRow[]).map(toFaqMatch);
      return { q, matches, keys: matches.map((m) => keyById.get(m.id) ?? null) };
    }),
  );
}

type Metrics = {
  inScope: number;
  outOfScope: number;
  top1: number;
  top3: number;
  /** In scope: the bot answers, from the right FAQ. */
  answeredCorrectly: number;
  /** In scope: the bot answers, from the wrong FAQ. */
  answeredWrong: number;
  /** Out of scope: the bot answers anyway. */
  falseAccepts: number;
};

function measure(results: Result[], settings: RetrievalSettings): Metrics {
  const m: Metrics = {
    inScope: 0,
    outOfScope: 0,
    top1: 0,
    top3: 0,
    answeredCorrectly: 0,
    answeredWrong: 0,
    falseAccepts: 0,
  };
  for (const r of results) {
    const answered = decideAnswer(r.matches, settings).kind === "answer";
    if (r.q.expected === null) {
      m.outOfScope++;
      if (answered) m.falseAccepts++;
      continue;
    }
    m.inScope++;
    const correct = r.keys[0] === r.q.expected;
    if (correct) m.top1++;
    if (r.keys.slice(0, 3).includes(r.q.expected)) m.top3++;
    if (answered && correct) m.answeredCorrectly++;
    if (answered && !correct) m.answeredWrong++;
  }
  return m;
}

/**
 * Settings that maximize correct outcomes (right answer given, or out-of-scope declined)
 * with false accepts ≤ 10% and confidently wrong answers ≤ 10%.
 */
function suggestSettings(runs: Run[], language: Language, hybrid: boolean): RetrievalSettings {
  let best: { settings: RetrievalSettings; score: number } | null = null;
  const steps = (from: number, to: number) =>
    Array.from({ length: Math.round((to - from) / 0.005) + 1 }, (_, i) =>
      Number((from + i * 0.005).toFixed(3)),
    );
  for (const run of runs.filter((r) => r.variant === SHIPPED && r.hybrid === hybrid)) {
    const results = run.results.filter((r) => r.q.language === language);
    for (const threshold of steps(0.8, 0.96)) {
      for (const corroboratedThreshold of steps(0.75, threshold)) {
        for (const minOverlap of [0.34, 0.5, 0.67, 1]) {
          const settings = { hybrid: run.hybrid, threshold, corroboratedThreshold, minOverlap };
          const m = measure(results, settings);
          if (m.falseAccepts > MAX_FALSE_ACCEPT * m.outOfScope) continue;
          if (m.answeredWrong > MAX_FALSE_ACCEPT * m.inScope) continue;
          const score = m.answeredCorrectly + (m.outOfScope - m.falseAccepts);
          // Ties go to the stricter setting (fewer surprises on unseen questions).
          if (!best || score >= best.score) best = { settings, score };
        }
      }
    }
  }
  return (
    best?.settings ?? { hybrid: true, threshold: 0.96, corroboratedThreshold: 0.96, minOverlap: 1 }
  );
}

const row = (label: string, m: Metrics) =>
  `| ${label} | ${pct(m.top1, m.inScope)} | ${pct(m.top3, m.inScope)} | ${pct(m.answeredCorrectly, m.inScope)} | ${pct(m.answeredWrong, m.inScope)} | ${pct(m.falseAccepts, m.outOfScope)} |`;

const TABLE_HEAD = [
  "| | Top-1 | Top-3 | Answered correctly | Answered wrong | False accepts |",
  "|---|---|---|---|---|---|",
];

function report(runs: Run[]): string {
  const of = (variant: EmbeddingVariant, hybrid: boolean, language: Language) =>
    runs
      .find((r) => r.variant === variant && r.hybrid === hybrid)!
      .results.filter((r) => r.q.language === language);
  const shipped = (language: Language) => of(SHIPPED, RETRIEVAL[language].hybrid, language);

  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Retrieval report",
    "",
    `Generated by \`pnpm eval:retrieval\` on **${date}**. Do not edit by hand; re-run it after changing the embedding text, the retrieval settings or \`match_faqs\`.`,
    "",
    `- **FAQ set:** Kroj demo bot, ${faqs.filter((f) => f.language === "en").length} EN + ${faqs.filter((f) => f.language === "sr").length} SR (\`src/lib/demo/kroj-faqs.json\`).`,
    `- **Golden set:** \`eval/faq-retrieval.json\`, ${golden.length} queries: ${golden.filter((q) => q.expected).length} in scope (paraphrases, typos, Serbian without diacritics), ${golden.filter((q) => !q.expected).length} out of scope.`,
    "- **Pipeline:** `gte-small` (384 dims) through the `embed` Edge Function, `match_faqs` filtered to the query's language, `decideAnswer` from `src/lib/faqs/retrieval.ts`.",
    `- **Shipped settings:** EN = ${fmt(RETRIEVAL.en)}; SR = ${fmt(RETRIEVAL.sr)}.`,
    "",
    "*Top-1 / Top-3*: the expected FAQ ranks first / in the first three (in-scope queries). *Answered correctly*: the bot answers, from the expected FAQ. *Answered wrong*: the bot answers from another FAQ. *False accepts*: the bot answers an out-of-scope question (target ≤ 10%).",
    "",
    "> **Read with care.** The thresholds were picked on this same golden set, so these numbers are optimistic. Expect somewhat lower accuracy on questions nobody has seen yet.",
    "",
    "## Shipped settings",
    "",
    ...TABLE_HEAD,
    ...LANGUAGES.map((l) =>
      row(`${l.toUpperCase()} (${fmt(RETRIEVAL[l])})`, measure(shipped(l), RETRIEVAL[l])),
    ),
    "",
    "## Targets (spec §12)",
    "",
  ];

  for (const l of LANGUAGES) {
    const vector = measure(of(SHIPPED, false, l), RETRIEVAL[l]);
    const met = vector.top1 / vector.inScope >= TARGET_TOP1[l];
    lines.push(
      `- ${l.toUpperCase()} top-1, vector only: ${pct(vector.top1, vector.inScope)} (target ${TARGET_TOP1[l] * 100}%) → **${met ? "met" : "missed"}**`,
    );
    if (!met) {
      const hybrid = measure(of(SHIPPED, true, l), RETRIEVAL[l]);
      lines.push(`  - with hybrid search: ${pct(hybrid.top1, hybrid.inScope)}`);
    }
  }
  for (const l of LANGUAGES) {
    const m = measure(shipped(l), RETRIEVAL[l]);
    lines.push(
      `- ${l.toUpperCase()} false accepts, shipped settings: ${pct(m.falseAccepts, m.outOfScope)} (target ≤ 10%) → **${m.falseAccepts <= MAX_FALSE_ACCEPT * m.outOfScope ? "met" : "missed"}**`,
    );
  }

  lines.push(
    "",
    "Suggested settings (most correct outcomes with false accepts and wrong answers each ≤ 10%):",
    "",
    "| Language · ranking | Suggested settings | Answered correctly | Answered wrong | False accepts |",
    "|---|---|---|---|---|",
    ...LANGUAGES.flatMap((l) =>
      [false, true].map((hybrid) => {
        const settings = suggestSettings(runs, l, hybrid);
        const m = measure(of(SHIPPED, hybrid, l), settings);
        return `| ${l.toUpperCase()} · ${hybrid ? "hybrid" : "vector"} | ${fmt(settings)} | ${pct(m.answeredCorrectly, m.inScope)} | ${pct(m.answeredWrong, m.inScope)} | ${pct(m.falseAccepts, m.outOfScope)} |`;
      }),
    ),
    "",
    "## Threshold sweep",
    "",
    "Shipped ranking per language; one threshold for both rules (no keyword bonus).",
    "",
    "| Threshold | EN answered correctly | EN false accepts | SR answered correctly | SR false accepts |",
    "|---|---|---|---|---|",
  );
  for (let i = 0; i <= 14; i++) {
    const t = Number((0.8 + i * 0.01).toFixed(2));
    const cells = LANGUAGES.flatMap((l) => {
      const m = measure(shipped(l), { ...RETRIEVAL[l], threshold: t, corroboratedThreshold: t });
      return [pct(m.answeredCorrectly, m.inScope), pct(m.falseAccepts, m.outOfScope)];
    });
    lines.push(`| ${t.toFixed(2)} | ${cells.join(" | ")} |`);
  }

  lines.push(
    "",
    "## Configurations compared",
    "",
    "Same golden set and the shipped thresholds for each language; only the embedding text and the ranking change.",
    "",
    ...TABLE_HEAD,
  );
  for (const run of runs) {
    for (const l of LANGUAGES) {
      lines.push(
        row(
          `${l.toUpperCase()} · ${run.variant} · ${run.hybrid ? "hybrid" : "vector"}`,
          measure(of(run.variant, run.hybrid, l), RETRIEVAL[l]),
        ),
      );
    }
  }

  lines.push(
    "",
    "## Misses (shipped settings)",
    "",
    "| Lang | Query | Expected | Top match (similarity, keyword overlap) |",
    "|---|---|---|---|",
  );
  for (const l of LANGUAGES) {
    for (const r of shipped(l)) {
      const answered = decideAnswer(r.matches, RETRIEVAL[l]).kind === "answer";
      const ok = r.q.expected === null ? !answered : answered && r.keys[0] === r.q.expected;
      if (ok) continue;
      const top = r.matches[0];
      const got = top
        ? `${r.keys[0]} (${top.similarity?.toFixed(3) ?? "text only"}, ${top.keywordOverlap === null ? "–" : `${Math.round(top.keywordOverlap * 100)}%`})${answered ? "" : " — declined"}`
        : "nothing";
      lines.push(
        `| ${l} | ${r.q.query.replace(/\|/g, "\\|")} | ${r.q.expected ?? "*(should decline)*"} | ${got} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { ownerId, botId, keyById, idByFaq } = await setup();
  try {
    const runs: Run[] = [];
    for (const variant of Object.keys(EMBEDDINGS) as EmbeddingVariant[]) {
      await indexFaqs(variant, idByFaq);
      const vectors = await embedTexts(
        golden.map((q) => EMBEDDINGS[variant].query(q.query)),
        embedConfig,
      );
      for (const hybrid of [false, true]) {
        runs.push({ variant, hybrid, results: await runQueries(botId, keyById, vectors, hybrid) });
      }
    }

    const text = report(runs);
    console.log(text);
    if (write) {
      writeFileSync(resolve("docs/RETRIEVAL_REPORT.md"), text);
      console.log("\nWrote docs/RETRIEVAL_REPORT.md");
    }
  } finally {
    await admin.auth.admin.deleteUser(ownerId);
  }
}

main().catch((error: unknown) => {
  if (error instanceof EmbedError) {
    console.error(
      `The embed function isn't reachable (${error.reason}). Start the stack with the Edge runtime: pnpm db:start:embed`,
    );
  }
  console.error(error);
  process.exit(1);
});
