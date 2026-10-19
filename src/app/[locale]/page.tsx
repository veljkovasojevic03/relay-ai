import { useTranslations } from "next-intl";
import { BookOpenText, Code, UserRound } from "lucide-react";

// Styled placeholder. Replaced by the real landing page in Phase 12.
export default function Home() {
  const t = useTranslations("Home");

  const steps = [
    { icon: BookOpenText, label: t("steps.faq") },
    { icon: Code, label: t("steps.embed") },
    { icon: UserRound, label: t("steps.handoff") },
  ];

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
      <section className="flex flex-col gap-6">
        <span className="w-fit rounded-full border bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
          {t("badge")}
        </span>
        <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          {t("title")}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t("lead")}</p>

        <div className="mt-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("steps.title")}
          </h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, label }, i) => (
              <li key={label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">
                  <span className="sr-only">{i + 1}. </span>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <figure
        aria-label={t("preview.label")}
        className="rounded-3xl border bg-card p-5 shadow-card"
      >
        <div className="flex flex-col gap-3">
          <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background">
            {t("preview.visitor")}
          </p>
          <div className="max-w-[85%]">
            <p className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">{t("preview.bot")}</p>
            <p className="mt-1.5 px-1 text-xs text-muted-foreground">{t("preview.source")}</p>
          </div>
          <p className="mt-2 w-fit rounded-full border border-primary px-3 py-1.5 text-sm font-medium text-primary">
            {t("preview.handoff")}
          </p>
        </div>
      </figure>
    </main>
  );
}
