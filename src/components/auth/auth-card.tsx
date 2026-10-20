import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        </CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-6">
        {children}
        {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/** Placeholder with the form's footprint while request-time data streams in. */
export function AuthFormSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-2">
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-9 rounded-md bg-muted" />
        </div>
      ))}
      <div className="h-9 rounded-md bg-muted" />
    </div>
  );
}
