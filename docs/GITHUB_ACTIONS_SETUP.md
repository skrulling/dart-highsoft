# GitHub Actions Setup for Supabase Migrations

This document explains how to configure GitHub Actions to automatically deploy Supabase migrations to production.

## Overview

The workflow automatically runs when:
- Changes are pushed to the `main` branch
- Files in `supabase/migrations/` are modified
- Manually triggered via GitHub Actions UI

## Required GitHub Secrets

You need to add the following secrets to your GitHub repository:

### 1. Navigate to Repository Settings
Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`

### 2. Add These Secrets

#### `SUPABASE_ACCESS_TOKEN`
**What:** Your Supabase personal access token
**How to get it:**
1. Go to https://supabase.com/dashboard/account/tokens
2. Click "Generate new token"
3. Give it a name (e.g., "GitHub Actions")
4. Copy the token

**Value example:** `sbp_abcdef1234567890...`

---

#### `SUPABASE_DB_PASSWORD`
**What:** Your production database password
**How to get it:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → Database
3. Copy the database password (you may need to reset it if you don't have it saved)

**Value example:** `your-database-password-here`

---

#### `SUPABASE_PROJECT_ID`
**What:** Your Supabase project reference ID
**How to get it:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → General
3. Find "Reference ID" or look at your project URL
4. It's the part that looks like: `https://app.supabase.com/project/YOUR_PROJECT_ID`

**Value example:** `zwqutohfukngrdizflls`

---

## How to Add Secrets to GitHub

### Via GitHub Web UI:
1. Go to your repository on GitHub
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Enter the secret name (e.g., `SUPABASE_ACCESS_TOKEN`)
6. Paste the value
7. Click **Add secret**
8. Repeat for all three secrets

### Via GitHub CLI (if you have it installed):
```bash
gh secret set SUPABASE_ACCESS_TOKEN
# Paste your token when prompted

gh secret set SUPABASE_DB_PASSWORD
# Paste your password when prompted

gh secret set SUPABASE_PROJECT_ID
# Paste your project ID when prompted
```

---

## Testing the Workflow

### Automatic Trigger:
1. Make a change to a migration file in `supabase/migrations/`
2. Commit and push to `main` branch
3. Go to **Actions** tab in your GitHub repo
4. Watch the "Deploy Supabase Migrations" workflow run

### Manual Trigger:
1. Go to **Actions** tab in your GitHub repo
2. Click "Deploy Supabase Migrations" workflow
3. Click **Run workflow** button
4. Select branch (usually `main`)
5. Click **Run workflow**

---

## Workflow Details

The workflow performs these steps:
1. ✅ Checks out your code
2. ✅ Installs Supabase CLI
3. ✅ Links to your production project
4. ✅ Applies all pending migrations
5. ✅ Verifies migrations were applied successfully

---

## Troubleshooting

### Error: "Invalid access token"
- Check that `SUPABASE_ACCESS_TOKEN` is correct
- Generate a new token if needed

### Error: "Password authentication failed"
- Check that `SUPABASE_DB_PASSWORD` is correct
- You may need to reset your database password in Supabase dashboard

### Error: "Project not found"
- Check that `SUPABASE_PROJECT_ID` matches your production project
- Verify the project ID in your Supabase dashboard

### Migrations Not Running
- Ensure your migration files are in `supabase/migrations/` directory
- Check that files follow naming convention: `YYYYMMDDHHMMSS_description.sql`
- View workflow logs in GitHub Actions tab for detailed error messages

---

## Security Best Practices

✅ **Never commit secrets to your repository**
✅ **Use GitHub repository secrets** (encrypted at rest)
✅ **Limit access token permissions** to only what's needed
✅ **Rotate tokens periodically** (every 3-6 months)
✅ **Review migration files** carefully before merging to main
✅ **Test migrations locally first** using `supabase db reset`

---

## Local Testing

Before pushing to production, always test migrations locally:

```bash
# Reset your local database and apply all migrations
npm run supabase:reset

# Or manually
npx supabase db reset
```

---

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
