import { inject } from "vitest";

// Server modules read their config through serverEnv(); point them at the local stack.
const { url, publishableKey, secretKey } = inject("supabase");
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = publishableKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = secretKey;
process.env.NEXT_PUBLIC_APP_URL = "https://relay.test";
process.env.IP_HASH_SALT = "test-ip-hash-salt-0123456789";
// Never reach real integrations from tests.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.N8N_WEBHOOK_BASE;
// n8n runs simulated in tests; the secret signs the callback tests' requests.
delete process.env.N8N_MODE;
process.env.N8N_SHARED_SECRET = "test-n8n-shared-secret-0123456789abcdef";
