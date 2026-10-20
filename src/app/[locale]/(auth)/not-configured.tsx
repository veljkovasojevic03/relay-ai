import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** Shown instead of auth forms when the deployment has no Supabase credentials. */
export function NotConfigured() {
  const t = useTranslations("Auth");
  return (
    <Alert>
      <AlertDescription>{t("notConfigured")}</AlertDescription>
    </Alert>
  );
}
