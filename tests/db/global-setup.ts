import type { TestProject } from "vitest/node";

import { localSupabaseEnv } from "../../scripts/local-supabase.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    supabase: { url: string; publishableKey: string; secretKey: string };
  }
}

export default function setup(project: TestProject) {
  const env: Record<string, string> = localSupabaseEnv();
  project.provide("supabase", {
    url: env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    secretKey: env.SUPABASE_SERVICE_ROLE_KEY!,
  });
}
