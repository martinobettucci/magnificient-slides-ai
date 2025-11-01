# magnificient-slides-ai

## Getting Started

1. Generate a local JWT signing key once with `npm run supabase:jwt` (re-run with `npm run supabase:jwt -- --force` or `npm run supabase:jwt --force` to rotate).
2. Ensure you are using the Node version from `.nvmrc` (`nvm use`).
3. Install dependencies with `npm install`.
4. Start the Supabase stack with `npm run supabase:start` and keep it running.
5. Launch the edge functions with `npm run supabase:functions:serve` (runs in the background; stop later with `npm run supabase:functions:stop`).
6. Start the Vite dev server with `npm run dev`.

## Local Supabase Development

This project uses Supabase for data and edge functions. The repository now includes everything needed to run Supabase locally for development.

### Requirements

- Docker Desktop or another Docker runtime.
- Project dependencies installed (`npm install`) so the bundled Supabase CLI is available locally (`npx supabase`).
- A Supabase personal access token (`SUPABASE_ACCESS_TOKEN`) for CLI operations.

### Configuration

- `supabase/config.toml` pins the project reference (`ghisgtqpmmtcxvbcqpon`) and mirrors the default ports exposed by `supabase start`.
- `.env.local` (from the provided `.env.local.example`) should point Vite at the local API (`http://localhost:54321`) and use the anon key printed by `supabase start`. The service role key should **not** be exposed to the browser—keep it in CLI-only environments if you need it.
- The Supabase CLI stores containers and generated secrets in the `.supabase/` directory (ignored by Git).
- The first time you clone the project, run `npm run supabase:jwt` **before** `npm run supabase:start`. This creates `signing_keys.json`, which Supabase Auth uses for a stable JWT signing secret.
- Keep `npm run supabase:start` active and run `npm run supabase:functions:serve` after it finishes starting so the AI edge functions are reachable. Stop the functions with `npm run supabase:functions:stop` when you're done.

### Edge Function Secrets

`npm run supabase:jwt` stores a signing key in `signing_keys.json` and prints a `JWT_SECRET` that must be copied into `supabase/.env`. After that, the first `npm run supabase:start` run will populate the remaining Supabase credentials automatically, but the OpenAI- and auth-related values below still need to be curated:

- `OPENAI_API_KEY` – required; the script cannot source this automatically.
- `OPENAI_GENERATION_MODEL`, `OPENAI_FIX_MODEL`, `OPENAI_ANALYSIS_MODEL` – optional; override if you need different models than the built-in defaults.
- `MAX_HTML_FIX_ITER` – optional; tweak to limit how many times the queue worker asks OpenAI to fix broken HTML (defaults to 5).
- `JWT_SECRET` – copy the value printed by `npm run supabase:jwt` so `supabase/functions/main` can verify incoming JWTs.
- `VERIFY_JWT` – set to `true` (and supply `JWT_SECRET`) to enforce verification, otherwise leave as `false`.

The generator writes an `HS256` shared-secret key so your local `JWT_SECRET` stays in sync with Supabase Auth. For production setups, follow the [Supabase signing key guidance](https://supabase.com/docs/guides/auth/signing-keys) to migrate to asymmetric keys and rotate them via the dashboard.

Example snippet to append to `supabase/.env`:

```ini
OPENAI_API_KEY=sk-your-key
OPENAI_GENERATION_MODEL=gpt-4.1-mini
OPENAI_FIX_MODEL=gpt-4o-mini-2024-07-18
OPENAI_ANALYSIS_MODEL=gpt-4o-2024-08-06
MAX_HTML_FIX_ITER=5
JWT_SECRET=paste-the-value-printed-by-npm-run-supabase:jwt
VERIFY_JWT=false
```

### Common Commands

- `npm run supabase:jwt` – generate or rotate the local Auth signing key (creates `signing_keys.json`).
- `npm run supabase:functions:stop` – stop the background edge function server and clean up the PID file.

The `scripts/` directory provides thin wrappers around the Supabase CLI so the
correct Node/NVM environment is always used. Each script also has a matching
`npm run` alias:

| Script                                 | npm alias                           | Description                                         |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `scripts/supabase-start.sh`            | `npm run supabase:start`            | Start the local Supabase stack                      |
| `scripts/supabase-stop.sh`             | `npm run supabase:stop`             | Stop all Supabase containers                        |
| `scripts/supabase-status.sh`           | `npm run supabase:status`           | Show container status and URLs                      |
| `scripts/supabase-db-reset.sh`         | `npm run supabase:db:reset`         | Drop & recreate database (adds `--force`)           |
| `scripts/supabase-db-push.sh`          | `npm run supabase:db:push`          | Apply new migrations                                |
| `scripts/supabase-db-diff.sh`          | `npm run supabase:db:diff`          | Generate migrations by diffing schemas              |
| `scripts/supabase-db-seed.sh`          | `npm run supabase:db:seed`          | Run seed scripts                                    |
| `scripts/supabase-migration-new.sh`    | `npm run supabase:migration:new`    | Scaffold a new migration                            |
| `scripts/supabase-functions-serve.sh`  | `npm run supabase:functions:serve`  | Serve edge functions locally                        |
| `scripts/supabase-functions-stop.sh`   | `npm run supabase:functions:stop`   | Stop the background edge function server            |
| `scripts/supabase-functions-deploy.sh` | `npm run supabase:functions:deploy` | Deploy edge functions                               |
| `scripts/supabase-export-deploy.sh`    | `npm run supabase:export`           | Generate `/deploy` bundle with compose/env template |

All scripts ultimately route through `scripts/supabase-cli.sh`, so you can run
arbitrary commands via:

```bash
./scripts/supabase-cli.sh <command> [args...]
```

These commands are also exposed through the VS Code task runner (see
`.vscode/tasks.json`). Running `supabase-start` will also refresh `.env.local`
and `supabase/.env` with the latest local credentials so your front-end,
functions, and CLI share the same settings automatically.
