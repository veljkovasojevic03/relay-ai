# n8n/

Local, self-hosted n8n for the app's **real** mode. The workflows are built by hand from
`RELAY_AI_N8N_WORKBOOK.md`; **no workflow JSON is generated here**. When they're done, export
them to `n8n/workflows/` as your own work (check that no secret is in the export).

The contract is in [`docs/N8N_CONTRACT.md`](../docs/N8N_CONTRACT.md).

## Start

```bash
cd n8n
cp .env.example .env       # fill in N8N_ENCRYPTION_KEY and N8N_SHARED_SECRET
docker compose up -d       # then open http://localhost:5678 and create the owner account
```

`N8N_SHARED_SECRET` must be the same value in `n8n/.env` and in the app's `.env.local`.
Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Stop with `docker compose down`. Workflows and credentials live in the `n8n_data` volume and
survive restarts. `docker compose down -v` deletes them.

## What the compose file sets, and why

| Setting                              | Why                                                          |
| ------------------------------------ | ------------------------------------------------------------ |
| `N8N_ENCRYPTION_KEY`                 | saved credentials stay readable after a restart              |
| `N8N_SHARED_SECRET`                  | the HMAC key; Code nodes read it as `$env.N8N_SHARED_SECRET` |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` | n8n 2.x blocks `$env` in Code nodes by default               |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | lets a Code node `require('crypto')` for HMAC                |
| `N8N_RUNNERS_ENABLED=true`           | Code nodes run in n8n's built-in task runner (2.x default)   |
| `WEBHOOK_URL=http://localhost:5678/` | the editor shows the URLs the app calls                      |
| `GENERIC_TIMEZONE=Europe/Belgrade`   | Schedule triggers use your time                              |
| `extra_hosts: host.docker.internal`  | workflows reach the app on Linux too                         |
| port bound to `127.0.0.1`            | n8n is reachable from this machine only                      |

If `require('crypto')` still fails in a Code node, n8n's built-in **Crypto** node can compute
the same HMAC (action _Hmac_, type SHA256, encoding hex) with the secret from `$env`.

## Reaching the app from n8n

The app runs on your machine (`pnpm dev`, port 3000) and n8n in Docker, where `localhost` is
the container itself. In HTTP Request nodes use `http://host.docker.internal:3000`:

- `POST http://host.docker.internal:3000/api/n8n/callback` (signed)
- `POST http://host.docker.internal:3000/api/demo/orders/lookup` (`X-Relay-Secret`)
- `GET http://host.docker.internal:3000/api/n8n/digest?period=7d` (`X-Relay-Secret`)

## Switching the app to real mode

In the app's `.env.local`:

```
N8N_MODE=real
N8N_WEBHOOK_BASE=http://localhost:5678/webhook
N8N_SHARED_SECRET=<same as n8n/.env>
```

Restart `pnpm dev`. The app calls the **production** webhook URLs (`/webhook/...`), which work
only while a workflow is **Active**. `pnpm n8n:send … --test` targets the test URLs
(`/webhook-test/...`) instead, for use with "Listen for test event".

## Testing your workflows

```bash
pnpm n8n:send order_status                    # KR-10482 / marko@example.com
pnpm n8n:send order_status --email x@example.com   # must be found: false
pnpm n8n:send order_status --bad-signature    # must be invalid_signature (401)
pnpm n8n:send order_status --stale            # must be stale_timestamp (401)
pnpm n8n:send order_status --no-signature     # must be bad_request (400)
pnpm n8n:send create_ticket --nasty --to you@gmail.com
pnpm n8n:send escalation --to you@gmail.com   # also waits for the callback
pnpm n8n:send reply_email --to you@gmail.com
pnpm n8n:verify                               # the app's callback rejection rules
```

For `escalation` and `reply_email` the script records the event in the app's outbox first
(when Supabase is configured in `.env.local`), so your workflow's callback is accepted, and it
reports what the callback said. Run the app (`pnpm dev`) for the callback to land.

Demo orders (seeded by migration `20261025090000_n8n_actions.sql`):

| Order    | Email                      | Status     |
| -------- | -------------------------- | ---------- |
| KR-10482 | marko@example.com          | shipped    |
| KR-10377 | ana.petrovic@example.com   | delivered  |
| KR-10519 | jelena@example.com         | processing |
| KR-10233 | nikola@example.com         | cancelled  |
| KR-10561 | sara.jovanovic@example.com | shipped    |
| KR-10598 | luka@example.com           | processing |
