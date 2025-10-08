# magnificient-slides-ai

## Getting Started

1. Ensure you are using the Node version from `.nvmrc` (`nvm use`).
2. Install dependencies with `npm install`.
3. Start the Vite dev server with `npm run dev`.

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

### Common Commands

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
