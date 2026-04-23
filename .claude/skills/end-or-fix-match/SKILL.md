---
name: end-or-fix-match
description: Manually end, fix, or edit a dart-highsoft match in the prod/staging database. Use when a live match is stuck (e.g. duplicate-key errors, orphan throws, a player can't register more darts), when a match needs to be declared complete with a chosen winner without continuing play, or when a completed match needs its winner/Elo/throws corrected. Involves direct SQL against Supabase Postgres.
---

# End or Fix a Match

Workflow for direct-SQL surgery on `matches` / `legs` / `turns` / `throws` / `elo_ratings_multi` when the app's own flows can't recover a match. Keep changes in a single transaction so a failure rolls back cleanly.

## When to use

- A live match is stuck (unique-constraint on `idx_throws_unique_turn_dart`, can't advance turn, etc).
- The user wants to declare a winner and close the match without forcing the UI to reach a legal checkout.
- A completed match has wrong data (wrong winner, missing Elo, orphan throws).

Do **not** use for routine "end early" — the `/api/matches/[id]/end` endpoint does that (sets `ended_early=true`, skips Elo). This skill is for cases where the endpoint isn't sufficient.

## Prerequisites

- `psql` installed (repo uses libpq from Homebrew).
- Prod DB password. **Check `$PGPASSWORD` in the environment first** (`printenv PGPASSWORD | head -c1 && echo` — prints nothing if unset). If it's empty, **ask the user to paste it** and tell them to prefix with `!export` so it goes into the shell without landing in the transcript:

  ```
  !export PGPASSWORD='<paste here>'
  ```

  Never guess. Never read from `.env*` or `supabase/.temp/*` — those don't hold the DB password, and the sandbox will block it anyway. Never proceed without the password.
- Explicit user authorization before any write. Reads against prod need a named target too.
- Supabase CLI linked to the right project (`supabase projects list` shows `●` on the linked one). Confirm with the user which environment you're editing.

## Connection

Use the pooler URL from `supabase/.temp/pooler-url`:

```
postgresql://postgres.<project-ref>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Single-session pattern:

```bash
export PGPASSWORD='<user-provided>'
psql "<pooler-url>" <<'SQL'
-- statements here
SQL
```

## Diagnose first

Before writing, identify:

1. Match row (`matches`): `id`, `winner_player_id`, `completed_at`, `ended_early`, `legs_to_win`, `finish`, `start_score`, `fair_ending`, `tournament_match_id`.
2. Legs (`legs`): which leg is active (`winner_player_id is null`).
3. Turns for that leg (`turns`): the latest `turn_number`, `player_id`, `total_scored`, `busted`.
4. Throws (`throws`) for the latest turn: check for gaps in `dart_index`. A gap (e.g. row at `dart_index=2` with no `dart_index=1`) is the signature of the duplicate-key bug — the client's `newDartIndex = darts.length + 1` collides with whatever is already sitting at the higher index.
5. Current Elo (`players.elo_rating`, `players.elo_rating_multi`) for all match participants.
6. Tournament-linked? If `matches.tournament_match_id is not null`, **stop and ask** — tournament matches have cross-table consequences, and `/api/matches/[id]/end` itself refuses them.

## End a match with a declared winner

Intent: match is completed normally (counts for leaderboards, Elo runs). Do NOT set `ended_early=true` — that flag is filtered out by `useLeaderboardData` and the stats hooks.

```sql
begin;

update legs
   set winner_player_id = '<winner-uuid>'
 where id = '<active-leg-uuid>'
   and winner_player_id is null;

update matches
   set winner_player_id = '<winner-uuid>',
       completed_at     = now()
 where id = '<match-uuid>'
   and winner_player_id is null
   and completed_at    is null;
```

Then run Elo (see next section) and `commit;`.

If the match has multiple legs and the winner hasn't actually won `legs_to_win` yet, declaring it complete bypasses the normal win-count check in `src/lib/server/completeLeg.ts`. That's fine for manual fixes — just be deliberate.

## Elo update

The app uses two RPCs depending on player count:

- **2 players** — `update_elo_ratings(p_match_id uuid, p_winner_id uuid, p_loser_id uuid, p_k_factor integer)`
- **3+ players** — `update_elo_ratings_multiplayer(p_match_id uuid, p_player_ids uuid[], p_ranks integer[], p_k_factor integer)`

Default `k_factor` is 32 (matches `completeLeg.ts`). Ranks are 1 for winner, 2 for everyone else (ties not currently modeled):

```sql
select * from update_elo_ratings_multiplayer(
  '<match-uuid>'::uuid,
  array['<winner-uuid>', '<loser1>', '<loser2>', ...]::uuid[],
  array[1, 2, 2, ...]::integer[],
  32
);
```

The RPC writes one row per player to `elo_ratings_multi` (or `elo_ratings` for 2p) with `rating_before`, `rating_after`, `rating_change`, and also updates `players.elo_rating_multi` / `players.elo_rating`. Verify rating deltas sum to 0.

Do **not** call the RPC twice for the same match — it'll double-count. If unsure, check:

```sql
select count(*) from elo_ratings_multi where match_id = '<match-uuid>';
```

Non-zero means Elo already ran for this match.

## Fixing an orphan throw / broken dart_index

Two approaches depending on intent:

**Keep what's there (simplest, usually right):**
Leave the orphan row, declare the match won, move on. Harmless for stats — the turn just shows a single-dart entry.

**Renumber to close the gap** (so the app would allow more darts if the match stayed open):

```sql
update throws set dart_index = 1
 where id = '<orphan-throw-uuid>';
```

**Clear the turn entirely** (e.g. if replacing with fabricated darts):

```sql
delete from throws where turn_id = '<turn-uuid>';
update turns set total_scored = 0, busted = false where id = '<turn-uuid>';
```

Then insert fresh throws with correct `dart_index` 1..N and update `turns.total_scored`.

## Verification queries (always run after commit)

```sql
select id, winner_player_id, completed_at, ended_early
  from matches where id = '<match-uuid>';

select id, winner_player_id
  from legs where match_id = '<match-uuid>';

select display_name, elo_rating, elo_rating_multi
  from players where id = any(array[<player-uuids>]::uuid[])
  order by display_name;

select count(*) from elo_ratings_multi where match_id = '<match-uuid>';
```

## Common pitfalls

- **Views and `security_invoker`**: this codebase has had repeated regressions where `create or replace view` resets `security_invoker` (see `CLAUDE.md` and migration 0037). Not relevant to data-fix SQL but relevant if you touch views.
- **`ended_early=true`**: excludes the match from leaderboards and stats hooks (`useLeaderboardData`, `useStatsData`, leaderboards page). Only set this if the user specifically wants the match to be unranked. Elo RPC rows in `elo_ratings_multi` still persist if you also call the RPC, but the per-player current rating will drift away from the visible leaderboard history.
- **Tournament matches**: `tournament_match_id is not null` — loop the user in before touching these.
- **Idempotency**: the `where ... is null` guards on `legs.winner_player_id` and `matches.winner_player_id` let you safely re-run the update block; the Elo RPC does NOT have that guard, so check `elo_ratings_multi` first.
- **2 vs 3+ players**: picking the wrong RPC writes to the wrong history table and leaves `elo_rating` / `elo_rating_multi` inconsistent.

## Underlying bug to flag

The duplicate-key error comes from `src/app/api/matches/[matchId]/throws/route.ts` trusting the client's `dartIndex`, combined with `src/hooks/useMatchActions.ts` computing `newDartIndex = darts.length + 1`. A stale client (after undo/realtime races) can collide. Long-term fix: compute `dart_index` server-side from `max(dart_index) + 1` under the unique constraint. Mention this to the user when doing a fix so they can schedule the real code change.
