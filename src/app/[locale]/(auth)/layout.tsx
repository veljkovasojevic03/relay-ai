import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <>
      <SiteHeader minimal />
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
