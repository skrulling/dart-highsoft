# Local Supabase Setup

This project already contains Supabase SQL migrations under `supabase/migrations`.  
Follow the steps below to run a full Supabase stack locally (Postgres, Auth, Storage, Realtime, Studio) inside Docker using the Supabase CLI.

## 1. Prerequisites

- **Docker Desktop** (or any Docker engine) running.
- **Supabase CLI** v1.181+  
  - macOS: `brew install supabase/tap/supabase`  
  - npm: `npm install -g supabase`  
  - Other platforms: see [Supabase CLI docs](https://supabase.com/docs/guides/cli).

Check installation:

```bash
supabase --version
docker --version
```

## 2. Initialize Local Configuration (first run only)

The repo already includes an up-to-date `supabase/config.toml` generated from the latest Supabase CLI template, so you don’t need to run `supabase init`.  
We’ve preconfigured it to use **non-default ports** (`55421`+ range) so it can coexist with other Supabase projects.  
If you want to tweak ports or enable extra services (SMTP, image transformation, etc.), edit that file before starting the stack.

## 3. Start Supabase in Docker

From the project root:

```bash
supabase start
```

What this does:

- Pulls Supabase service images.
- Starts Postgres, Realtime, Auth, Storage, Edge Runtime, and Studio containers.
- Applies every migration in `supabase/migrations`.
- Generates a `.env` file with connection details under `supabase/.temp/`.

CLI output includes the local URL, anon/service keys, and connection strings.

> **Tip:** If you change migrations or configuration, run `supabase stop` followed by `supabase start` to restart from a clean slate.

## 4. Connect the Next.js app

1. Copy the generated client env values:

   ```bash
   supabase status --env
   ```

   This prints `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

2. Create `.env.local` at the project root (if it does not exist) and add:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
   NEXT_PUBLIC_SUPABASE_ANON_KEY=... # from supabase status --env
   SUPABASE_SERVICE_ROLE_KEY=...     # optional, only needed for server-side admin tasks
   ```

3. Start the web app:

   ```bash
   npm install
   npm run dev
   ```

The app now talks to the local Supabase instance.

## 5. Applying Future Database Changes

1. Create new migrations with the CLI:

   ```bash
   supabase migration new add_new_feature
   ```

2. Edit the generated SQL file under `supabase/migrations`.
3. Apply the migration to the local stack:

   ```bash
   supabase db reset      # drops/recreates db, re-runs all migrations
   # or
   supabase db push       # applies unapplied migrations only
   ```

4. Once verified, commit the migration file.

## 6. Troubleshooting

| Symptom | Fix |
| ------- | ---- |
| `port already in use` | Our config already uses non-default ports (55421+). If they still collide, edit `supabase/config.toml` and rerun `supabase stop && supabase start`. |
| Containers keep restarting | Run `supabase stop --all`, then `docker system prune` (be careful—it removes unused containers/images). |
| Migrations failing | Check SQL under `supabase/migrations`. Run `supabase db reset` to reapply from scratch. |
| Need clean database | `supabase db reset` rebuilds the database and reapplies migrations. |

## 7. Stopping the Stack

```bash
supabase stop
```

- `supabase stop` stops containers but preserves Docker volumes.
- `supabase stop --all` also removes volumes (database data).

You’re now ready to test safely against a local Supabase stack without touching production.
