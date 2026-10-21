import { connection } from "next/server";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Rendered per request, never from a prerendered shell: the CSP nonce (src/proxy.ts) can
// only reach scripts rendered after the request arrived.
export const instant = false;

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  await connection();
  return (
    <>
      <SiteHeader minimal />
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
