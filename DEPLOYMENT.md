# Deployment Guide

This guide is for someone who has already cloned the repo locally and wants to deploy their own copy of the app with:

- Vercel for the Next.js app
- Supabase for the database and realtime backend

The repo already contains the database migrations in [`supabase/migrations`](./supabase/migrations), so the main job is:

1. Create your own Supabase project
2. Push this repo's schema to that project
3. Create your own Vercel project
4. Add the required environment variables
5. Deploy

## What This App Needs

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional environment variables for AI commentary / TTS:

```env
OPENAI_API_KEY=
COMMENTARY_PERSONA=
COMMENTARY_MODEL=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` come from your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` is also from Supabase, but it is secret. Do not expose it in client code.
- The app will still run without `OPENAI_API_KEY`, but the commentary and TTS routes will not work.

## Before You Start

Make sure you have:

- A GitHub account
- A Vercel account
- A Supabase account
- Node.js 18+ installed
- `npm install` already run in this repo

If you want the easy GitHub-based deployment flow, put the repo in your own GitHub account first.

## Option 1: Easiest Path For Most People

This is the recommended path:

- Create the Supabase project in the Supabase UI
- Push the schema from your local terminal
- Import the GitHub repo into Vercel in the Vercel UI

### Step 1: Put The Repo In Your Own GitHub Account

If you cloned someone else's repo, create a new GitHub repo in your own account and push your local copy there.

Example:

```bash
git remote -v
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

If you already have your own GitHub repo for this code, skip this step.

### Step 2: Create A Supabase Project In The UI

1. Go to `https://supabase.com/dashboard`
2. Click `New project`
3. Choose your organization
4. Give the project a name
5. Choose a strong database password and save it somewhere safe
6. Pick a region close to your Vercel region
7. Click `Create new project`
8. Wait for the project to finish provisioning

### Step 3: Link Your Local Repo To That Supabase Project

Install the Supabase CLI if you do not already have it, then log in:

```bash
supabase login
```

Now find your project reference in the Supabase dashboard URL. It looks like:

```text
https://supabase.com/dashboard/project/abcdefghijklmnop
```

In this example, the project ref is `abcdefghijklmnop`.

Link this repo to that project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

It may ask for your database password. Use the password you chose when you created the project.

### Step 4: Push This Repo's Database Migrations To Supabase

Run:

```bash
supabase db push
```

This applies the SQL files in [`supabase/migrations`](./supabase/migrations) to your remote Supabase database.

### Step 5: Copy The Supabase Keys You Need

In the Supabase dashboard:

1. Open your project
2. Go to `Project Settings` -> `API`
3. Copy these values:
   - `Project URL`
   - `anon` / publishable key
   - `service_role` key

You will use them in Vercel as:

```env
NEXT_PUBLIC_SUPABASE_URL=Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon key
SUPABASE_SERVICE_ROLE_KEY=service_role key
```

### Step 6: Import The GitHub Repo Into Vercel

1. Go to `https://vercel.com/new`
2. Import your GitHub repository
3. If Vercel asks for GitHub access, allow it
4. Confirm the root directory is the repo root
5. Vercel should detect `Next.js` automatically
6. Open the environment variable section before deploying
7. Add:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

8. If you want commentary and TTS, also add:

```env
OPENAI_API_KEY=...
COMMENTARY_PERSONA=...
COMMENTARY_MODEL=...
```

9. Click `Deploy`

After the first deploy, every push to the connected GitHub repo should trigger a new Vercel deployment automatically.

### Step 7: Verify The Deployment

After Vercel finishes:

1. Open the deployed URL
2. Go to `Players` and create a player
3. Start a new match
4. Confirm that the match page loads and scores save correctly

If that works, your deployment is live.

## Option 2: CLI-First Deployment

This path is useful if you want to create both projects from the terminal.

## Supabase With The CLI

### Step 1: Log In

```bash
supabase login
```

### Step 2: Find Your Supabase Org ID

```bash
supabase orgs list
```

Pick the org where you want the new project to live.

### Step 3: Create The Supabase Project

Example:

```bash
supabase projects create dart-highsoft-prod \
  --org-id YOUR_ORG_ID \
  --region YOUR_REGION
```

You can also provide `--db-password YOUR_PASSWORD` if you want to set it in the command.

After the project is created, note its project ref.

### Step 4: Link This Repo To The New Supabase Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 5: Push The Schema

```bash
supabase db push
```

### Step 6: Get Your Supabase API Values

The simplest way is still the dashboard:

1. Open the project in Supabase
2. Go to `Project Settings` -> `API`
3. Copy the `Project URL`, `anon` key, and `service_role` key

## Vercel With The CLI

### Step 1: Log In

```bash
vercel login
```

### Step 2: Create Or Link The Vercel Project

From the repo root, run:

```bash
vercel link
```

If the project does not exist yet, Vercel can create it during the prompt flow.

### Step 3: Add Environment Variables

Add the required variables at minimum for `production`:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

If you want preview deployments to work too, add the same variables for `preview`:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

Optional commentary variables:

```bash
vercel env add OPENAI_API_KEY production
vercel env add COMMENTARY_PERSONA production
vercel env add COMMENTARY_MODEL production
```

### Step 4: Deploy

```bash
vercel --prod
```

Vercel will build the app and give you a production URL.

## Important Difference: Vercel GitHub Import vs CLI Deploy

- If you import the repo in the Vercel UI, Vercel connects directly to GitHub and auto-deploys on each push.
- If you only deploy with `vercel --prod`, you are doing manual CLI deployments.

If you want GitHub-based automatic deployments, use the Vercel UI import flow even if you also use the CLI later.

## Does Supabase Need The GitHub Repo Connected?

Not for the first deployment.

For this repo, the important Supabase step is that your remote project gets the SQL schema from [`supabase/migrations`](./supabase/migrations). The simplest reliable way to do that is:

1. Create the project in Supabase
2. Run `supabase link --project-ref ...`
3. Run `supabase db push`

Supabase also has GitHub-connected branching workflows, but that is optional and not required just to get this app live.

## Recommended Production Checklist

Before you call the deploy done, make sure:

- The Supabase project exists
- `supabase db push` ran without errors
- The Vercel project has the three required env vars
- The deployed site can create players and matches
- Vercel and Supabase are in nearby regions

## Useful Official Docs

- Vercel CLI overview: `https://vercel.com/docs/cli`
- Vercel project linking: `https://vercel.com/docs/cli/link`
- Vercel environment variables: `https://vercel.com/docs/cli/env`
- Vercel deploy command: `https://vercel.com/docs/cli/deploy`
- Supabase CLI reference: `https://supabase.com/docs/reference/cli/supabase-bootstrap`
- Supabase linking / deploy flow: `https://supabase.com/docs/guides/functions/deploy`

