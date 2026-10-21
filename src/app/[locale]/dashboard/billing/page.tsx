import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Check, CircleAlert, CircleCheck, FlaskConical, Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { asLocale } from "@/i18n/routing";
import { getOwnerProfile } from "@/lib/auth/session";
import { getUsage, periodResetsAt, type Usage } from "@/lib/billing/usage";
import { hasStripe } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { cn } from "@/lib/utils";

import { openPortalAction, startCheckoutAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/billing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Billing" });
  return { title: t("metaTitle") };
}

const ERRORS = ["notConfigured", "sandbox", "rateLimited", "stripe", "noCustomer"] as const;
const PLANS = {
  free: { bots: 1, conversations: 50 },
  pro: { bots: 3, conversations: 1000 },
} as const;

/** Plan, usage and Stripe test-mode Checkout/Portal (spec §4.9, Phase 11). */
export default async function BillingPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/billing">) {
  const query = await searchParams;
  const [profile, usage, t, format, locale] = await Promise.all([
    getOwnerProfile(),
    getUsage(),
    getTranslations("Billing"),
    getFormatter(),
    getLocale(),
  ]);
  const configured = hasStripe(serverEnv());
  const error = ERRORS.find((e) => e === query.error);
  const date = (iso: string | Date) => format.dateTime(new Date(iso), { dateStyle: "long" });
  const isPro = usage.plan === "pro";

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="flex items-center gap-2 rounded-full border border-accent-strong bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
          <FlaskConical className="size-4" aria-hidden="true" />
          {t("testMode")}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      )}
      {query.checkout === "success" && (
        <Alert role="status">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>
            {isPro ? t("checkout.active") : t("checkout.pending")}
          </AlertDescription>
        </Alert>
      )}
      {query.checkout === "cancelled" && (
        <Alert role="status">
          <Info aria-hidden="true" />
          <AlertDescription>{t("checkout.cancelled")}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="usage-title" className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="usage-title" className="text-lg font-semibold">
            {t("usage.title", { plan: t(`plans.${usage.plan}.name`) })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("usage.resets", { date: date(periodResetsAt(usage.period)) })}
          </p>
        </div>
        <Meter
          label={t("usage.conversations")}
          used={usage.conversations}
          limit={usage.conversationLimit}
          valueText={t("usage.of", { used: usage.conversations, limit: usage.conversationLimit })}
        />
        <Meter
          label={t("usage.bots")}
          used={usage.bots}
          limit={usage.botLimit}
          valueText={t("usage.of", { used: usage.bots, limit: usage.botLimit })}
        />
        {usage.bots > usage.botLimit && (
          <p className="text-sm text-muted-foreground">{t("usage.botsOver")}</p>
        )}
        {profile.subscriptionStatus && profile.currentPeriodEnd && (
          <SubscriptionLine
            status={profile.subscriptionStatus}
            text={
              profile.subscriptionStatus === "past_due"
                ? t("subscription.pastDue")
                : profile.cancelAtPeriodEnd
                  ? t("subscription.ends", { date: date(profile.currentPeriodEnd) })
                  : isPro
                    ? t("subscription.renews", { date: date(profile.currentPeriodEnd) })
                    : t("subscription.ended")
            }
          />
        )}
      </section>

      <section aria-labelledby="plans-title" className="grid gap-4">
        <h2 id="plans-title" className="text-lg font-semibold">
          {t("plansTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(["free", "pro"] as const).map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              current={usage.plan === plan}
              name={t(`plans.${plan}.name`)}
              price={t(`plans.${plan}.price`)}
              features={[
                t("plans.bots", { count: PLANS[plan].bots }),
                t("plans.conversations", { count: PLANS[plan].conversations }),
                t("plans.everything"),
              ]}
              currentLabel={t("current")}
            />
          ))}
        </div>

        {profile.isSandbox ? (
          <p className="text-sm text-muted-foreground">{t("errors.sandbox")}</p>
        ) : !configured ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("errors.notConfigured")}
          </p>
        ) : (
          <div className="grid gap-3">
            <form action={isPro ? openPortalAction : startCheckoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="lg">
                {isPro ? t("manage") : t("upgrade")}
              </Button>
            </form>
            {!isPro && <p className="text-sm text-muted-foreground">{t("testCard")}</p>}
            {!isPro && profile.subscriptionStatus && (
              <form action={openPortalAction}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="link" className="h-auto px-0">
                  {t("invoices")}
                </Button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Meter({
  label,
  used,
  limit,
  valueText,
}: {
  label: string;
  used: number;
  limit: number;
  valueText: string;
}) {
  const share = limit > 0 ? Math.min(used / limit, 1) : 1;
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={valueText}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-accent-strong" : "bg-primary",
          )}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

function SubscriptionLine({ status, text }: { status: string; text: string }) {
  return (
    <p
      className={cn(
        "text-sm",
        status === "past_due" ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      {text}
    </p>
  );
}

function PlanCard({
  plan,
  current,
  name,
  price,
  features,
  currentLabel,
}: {
  plan: Usage["plan"];
  current: boolean;
  name: string;
  price: string;
  features: string[];
  currentLabel: string;
}) {
  return (
    <div
      className={cn(
        "grid content-start gap-4 rounded-xl border bg-card p-5",
        current && "border-primary ring-1 ring-primary",
      )}
      data-plan={plan}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-2xl font-semibold">{name}</h3>
        {current && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
            {currentLabel}
          </span>
        )}
      </div>
      <p className="text-lg font-semibold">{price}</p>
      <ul className="grid gap-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
