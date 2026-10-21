import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import {
  BookOpenText,
  ChartColumn,
  Code,
  Feather,
  Inbox,
  Languages,
  LayoutDashboard,
  PackageSearch,
  Quote,
  Store,
  UserRound,
} from "lucide-react";

import { Handoff } from "@/components/landing/handoff";
import { LiveDemo } from "@/components/landing/live-demo";
import { Reveal } from "@/components/landing/reveal";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/lib/auth/redirects";
import { PLANS } from "@/lib/billing/plans";
import type { Lang } from "@/lib/demo/kroj";
import { LANDING_VIDEO } from "@/lib/landing/video";
import { cn } from "@/lib/utils";

/**
 * The landing page (spec §4.10): one shop owner, the live demo, and the way in.
 * Links don't prefetch: seven prefetched routes ran during load and cost mobile Lighthouse
 * its main-thread budget; these pages are small and load fast on click anyway.
 */
export default function Home() {
  const t = useTranslations("Home");
  const locale = useLocale() as Lang;
  const demoHref = localizedPath(locale, "/demo");

  return (
    <>
      <main id="main" tabIndex={-1}>
        <Hero demoHref={demoHref} locale={locale} />
        {/* Separate boundaries let React hydrate below-the-fold sections in smaller steps
            instead of one long main-thread task (Lighthouse TBT, Phase 12). */}
        <Suspense>
          {LANDING_VIDEO && <VideoSection />}
          <HowItWorks />
        </Suspense>
        <Suspense>
          <Features />
        </Suspense>
        <Suspense>
          <Pricing />
        </Suspense>
        <Suspense>
          <Faq />
        </Suspense>
        <section className="border-t bg-card">
          <Reveal className="mx-auto grid max-w-3xl justify-items-center gap-5 px-4 py-20 text-center sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("final.title")}
            </h2>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t("final.lead")}</p>
            <Ctas demoHref={demoHref} />
          </Reveal>
        </section>
      </main>
    </>
  );
}

function Ctas({ demoHref, className }: { demoHref: string; className?: string }) {
  const t = useTranslations("Home.cta");
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {/* A full page load: the demo's widget must not follow client navigation back here. */}
      <a href={demoHref} className={buttonVariants({ size: "lg" })}>
        <Store aria-hidden="true" />
        {t("demo")}
      </a>
      <Link
        prefetch={false}
        href="/sandbox"
        className={buttonVariants({ size: "lg", variant: "outline" })}
      >
        <LayoutDashboard aria-hidden="true" />
        {t("sandbox")}
      </Link>
      <Link
        prefetch={false}
        href="/signup"
        className={buttonVariants({ size: "lg", variant: "ghost" })}
      >
        {t("signup")}
      </Link>
    </div>
  );
}

function Hero({ demoHref, locale }: { demoHref: string; locale: Lang }) {
  const t = useTranslations("Home");
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
      <div className="flex flex-col gap-6">
        <p className="w-fit rounded-full border bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
          {t("hero.eyebrow")}
        </p>
        <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          {t("hero.title")}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t("hero.lead")}</p>
        <Ctas demoHref={demoHref} />
        <p className="text-sm text-muted-foreground">{t("cta.note")}</p>
      </div>
      <LiveDemo
        lang={locale}
        questions={[t("hero.demo.q1"), t("hero.demo.q2"), t("hero.demo.q3")]}
        copy={{
          shopTagline: t("hero.demo.shopTagline"),
          caption: t("hero.demo.caption"),
          greeting: t("hero.demo.greeting"),
          loading: t("hero.demo.loading"),
          failed: t("hero.demo.failed"),
        }}
      />
    </section>
  );
}

function VideoSection() {
  const t = useTranslations("Home.video");
  const video = LANDING_VIDEO!;
  return (
    <section aria-labelledby="video-title" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <Reveal className="grid gap-4">
        <h2 id="video-title" className="font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h2>
        <video
          className="w-full rounded-2xl border shadow-card"
          src={video.src}
          poster={video.poster}
          controls
          preload="none"
          playsInline
        />
      </Reveal>
    </section>
  );
}

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="grid max-w-2xl gap-3">
      <h2 id={id} className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="text-lg text-pretty text-muted-foreground">{lead}</p>}
    </div>
  );
}

function HowItWorks() {
  const t = useTranslations("Home.steps");
  return (
    <section aria-labelledby="how-title" className="border-y bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6">
        <Reveal>
          <SectionHeading id="how-title" title={t("title")} lead={t("lead")} />
        </Reveal>
        <ol className="grid gap-5 md:grid-cols-3">
          <Step n={1} icon={BookOpenText} title={t("faq.title")} text={t("faq.text")} late={false}>
            <ul className="grid gap-1.5 text-xs" aria-hidden="true">
              {[t("faq.example1"), t("faq.example2"), t("faq.example3")].map((q) => (
                <li key={q} className="rounded-lg border bg-background px-3 py-2">
                  {q}
                </li>
              ))}
            </ul>
          </Step>
          <Step n={2} icon={Code} title={t("embed.title")} text={t("embed.text")} late>
            <pre
              className="overflow-x-auto rounded-lg bg-foreground px-3 py-2.5 font-mono text-[11px] leading-relaxed text-background"
              aria-label={t("embed.codeLabel")}
            >
              <code>{`<script src="https://…/widget.js"\n  data-bot="your-bot-key" async>\n</script>`}</code>
            </pre>
          </Step>
          <Step n={3} icon={UserRound} title={t("handoff.title")} text={t("handoff.text")} late>
            <Handoff
              question={t("handoff.question")}
              reply={t("handoff.reply")}
              you={t("handoff.you")}
            />
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  text,
  late,
  children,
}: {
  n: number;
  icon: typeof Code;
  title: string;
  text: string;
  late: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Reveal
        late={late}
        className="flex h-full flex-col gap-4 rounded-2xl border bg-background p-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-muted-foreground">{n}</span>
        </div>
        <div className="grid gap-1.5">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-pretty text-muted-foreground">{text}</p>
        </div>
        <div className="mt-auto">{children}</div>
      </Reveal>
    </li>
  );
}

function Features() {
  const t = useTranslations("Home.features");
  const items = [
    { key: "answers", icon: Quote, wide: true },
    { key: "inbox", icon: Inbox, wide: false },
    { key: "actions", icon: PackageSearch, wide: false },
    { key: "languages", icon: Languages, wide: false },
    { key: "unknown", icon: ChartColumn, wide: false },
    { key: "light", icon: Feather, wide: true },
  ] as const;

  return (
    <section
      aria-labelledby="features-title"
      className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6"
    >
      <Reveal>
        <SectionHeading id="features-title" title={t("title")} lead={t("lead")} />
      </Reveal>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ key, icon: Icon, wide }, i) => (
          <li key={key} className={cn(wide && "lg:col-span-2")}>
            <Reveal
              late={i % 2 === 1}
              className={cn(
                "flex h-full flex-col gap-3 rounded-2xl border p-5",
                wide ? "bg-accent/60" : "bg-card",
              )}
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">{t(`${key}.title`)}</h3>
              <p className="text-sm text-pretty text-muted-foreground">{t(`${key}.text`)}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pricing() {
  const t = useTranslations("Home.pricing");
  const plans = ["free", "pro"] as const;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-6 border-y bg-card">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-20 sm:px-6">
        <Reveal className="grid gap-4">
          <SectionHeading id="pricing-title" title={t("title")} lead={t("lead")} />
          <p className="w-fit rounded-full border border-accent-strong bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
            {t("testMode")}
          </p>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-2">
          {plans.map((plan, i) => (
            <li key={plan}>
              <Reveal
                late={i === 1}
                className={cn(
                  "flex h-full flex-col gap-5 rounded-2xl border bg-background p-6",
                  plan === "pro" && "border-primary ring-1 ring-primary",
                )}
              >
                <div className="grid gap-1">
                  <h3 className="font-display text-2xl font-semibold">{t(`${plan}.name`)}</h3>
                  <p className="text-sm text-muted-foreground">{t(`${plan}.for`)}</p>
                </div>
                <p>
                  <span className="font-display text-4xl font-semibold">{t(`${plan}.price`)}</span>{" "}
                  <span className="text-muted-foreground">{t(`${plan}.per`)}</span>
                </p>
                <ul className="grid gap-2 text-sm">
                  <li>{t("bots", { count: PLANS[plan].bots })}</li>
                  <li>{t("conversations", { count: PLANS[plan].conversations })}</li>
                  <li>{t("everything")}</li>
                </ul>
                <Link
                  prefetch={false}
                  href="/signup"
                  className={cn(
                    buttonVariants({ variant: plan === "pro" ? "default" : "outline" }),
                    "mt-auto w-fit",
                  )}
                >
                  {t(`${plan}.cta`)}
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const t = useTranslations("Home.faq");
  const keys = ["credits", "unknown", "platform", "data", "try", "billing"] as const;
  return (
    <section
      aria-labelledby="faq-title"
      className="mx-auto grid max-w-3xl gap-8 px-4 py-20 sm:px-6"
    >
      <Reveal>
        <SectionHeading id="faq-title" title={t("title")} />
      </Reveal>
      <div className="grid gap-3">
        {keys.map((key) => (
          <details key={key} className="group rounded-xl border bg-card px-5 py-4">
            <summary className="cursor-pointer list-none font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-4">
                {t(`${key}.q`)}
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-pretty text-muted-foreground">{t(`${key}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
