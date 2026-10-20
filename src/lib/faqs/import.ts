import { ANSWER_MAX, IMPORT_MAX, QUESTION_MAX } from "./schema";

/**
 * Quick import (spec §4.3): pasted text in `Q: … A: …` blocks. Serbian `P:` (pitanje) and
 * `O:` (odgovor) work too, any case. A field runs until the next marker, so answers can
 * span several lines; blank lines inside an answer are kept as paragraph breaks.
 *
 *   Q: How long does shipping take?
 *   A: 1–3 business days in Serbia.
 *
 * Pure, so the client shows a live preview and the server re-parses what it trusts.
 */

export type ImportItem = { question: string; answer: string };
export type ImportProblem =
  | { kind: "missingAnswer"; line: number; question: string }
  | { kind: "missingQuestion"; line: number }
  | { kind: "questionTooLong"; line: number }
  | { kind: "answerTooLong"; line: number }
  | { kind: "tooMany"; max: number };
export type ImportResult = { items: ImportItem[]; problems: ImportProblem[] };

const MARKER = /^\s*(q|p|a|o)\s*[:.)]\s?(.*)$/i;

type Draft = { question: string[]; answer: string[] | null; line: number; answerLine: number };

const joinField = (lines: string[]) =>
  lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function parseFaqImport(text: string): ImportResult {
  const items: ImportItem[] = [];
  const problems: ImportProblem[] = [];
  let draft: Draft | null = null;
  // Answer text that appeared before any question; reported once per block.
  let orphanLine: number | null = null;

  const flush = () => {
    if (!draft) return;
    const question = joinField(draft.question).replace(/\s+/g, " ");
    const answer = draft.answer ? joinField(draft.answer) : "";
    if (!answer) {
      if (question) problems.push({ kind: "missingAnswer", line: draft.line, question });
    } else if (!question) {
      problems.push({ kind: "missingQuestion", line: draft.line });
    } else if (question.length > QUESTION_MAX) {
      problems.push({ kind: "questionTooLong", line: draft.line });
    } else if (answer.length > ANSWER_MAX) {
      problems.push({ kind: "answerTooLong", line: draft.answerLine });
    } else {
      items.push({ question, answer });
    }
    draft = null;
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const marker = MARKER.exec(raw);
    const kind = marker?.[1]?.toLowerCase();

    if (kind === "q" || kind === "p") {
      flush();
      orphanLine = null;
      draft = { question: [marker![2]!], answer: null, line, answerLine: line };
    } else if (kind === "a" || kind === "o") {
      if (!draft) {
        if (orphanLine === null) {
          orphanLine = line;
          problems.push({ kind: "missingQuestion", line });
        }
        return;
      }
      if (draft.answer) {
        // A second answer marker continues the same answer rather than losing text.
        draft.answer.push(marker![2]!);
      } else {
        draft.answer = [marker![2]!];
        draft.answerLine = line;
      }
    } else if (draft) {
      (draft.answer ?? draft.question).push(raw);
    }
  });
  flush();

  if (items.length > IMPORT_MAX) {
    problems.push({ kind: "tooMany", max: IMPORT_MAX });
  }
  return { items, problems };
}
