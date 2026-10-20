import { useTranslations } from "next-intl";

import { Separator } from "@/components/ui/separator";

export function OrDivider() {
  const t = useTranslations("Auth");
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs text-muted-foreground uppercase">{t("or")}</span>
      <Separator className="flex-1" />
    </div>
  );
}
