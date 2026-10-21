"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import type { Summary } from "@/lib/analytics/summary";

/**
 * Conversations per day, stacked: answered by the bot alone vs handed to the owner.
 * Two series → a legend, a per-day hover tooltip, and a table view for screen readers and
 * anyone who wants the numbers (the chart itself is aria-hidden).
 *
 * Colors validated with the dataviz palette checker on the card surface (#fffdf9): both
 * pass lightness, chroma, CVD separation (ΔE 20) and 3:1 contrast.
 */
export const SERIES = {
  byBot: "#2b7bb9",
  handedOff: "#c2562f",
} as const;

type Day = Summary["daily"][number];

export function ConversationsChart({ daily }: { daily: Day[] }) {
  const t = useTranslations("Analytics.chart");
  const format = useFormatter();
  const dayLabel = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  return (
    <figure className="grid gap-4">
      <ul
        className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        {(["byBot", "handedOff"] as const).map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: SERIES[key] }} />
            {t(key)}
          </li>
        ))}
      </ul>

      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {/* No keyboard layer: it would put a focusable element inside aria-hidden. The
              "Show as a table" view is the accessible version of this chart. */}
          <BarChart
            accessibilityLayer={false}
            data={daily}
            margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickFormatter={dayLabel}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={(props) => <DayTooltip {...props} dayLabel={dayLabel} />}
            />
            {/* The surface-colored stroke is the 2px gap between stacked segments and bars. */}
            <Bar
              dataKey="byBot"
              stackId="day"
              fill={SERIES.byBot}
              stroke="var(--card)"
              strokeWidth={2}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="handedOff"
              stackId="day"
              fill={SERIES.handedOff}
              stroke="var(--card)"
              strokeWidth={2}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="text-sm">
        <summary className="w-fit cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
          {t("table")}
        </summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("day")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("byBot")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("handedOff")}
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day} className="border-t">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {dayLabel(d.day)}
                  </th>
                  <td className="px-3 py-1.5 text-right">{d.byBot}</td>
                  <td className="px-3 py-1.5 text-right">{d.handedOff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function DayTooltip({
  active,
  payload,
  dayLabel,
}: Partial<TooltipContentProps> & { dayLabel: (iso: string) => string }) {
  const t = useTranslations("Analytics.chart");
  const day = payload?.[0]?.payload as Day | undefined;
  if (!active || !day) return null;
  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{dayLabel(day.day)}</p>
      {(["byBot", "handedOff"] as const).map((key) => (
        <p key={key} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES[key] }} />
          {t(key)}
          <span className="ml-auto pl-4 font-medium text-foreground tabular-nums">{day[key]}</span>
        </p>
      ))}
    </div>
  );
}
