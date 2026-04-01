# Repository Guidelines

> **Keep this file up to date.** When you add, remove, or rename files, routes, hooks, utils, or components, update the relevant sections of this file (especially the File Map and Key Flows). This ensures future agents can navigate the codebase without exploring from scratch.

## Goal
Help make small, correct changes in a TypeScript Next.js + Supabase dart scoring app without breaking auth, RLS, realtime, or build.

## Project Structure & Module Organization
- `src/app`: Next.js app router (routes, layout, styles). Example: `src/app/api/matches`.
- `src/components`: Feature components (PascalCase). `src/components/ui`: shadcn/ui primitives (lowercase files).
- `src/utils`: Game logic and helpers (e.g., `x01.ts`, `eloRating.ts`).
- `src/lib`: Client initializers and shared libs.
- `src/hooks`: React hooks for match state, actions, realtime, and commentary.
- `src/services`: External service clients (commentary API, TTS audio).
- `src/test-utils`: Test factories, mock Supabase client.
- `public`/`favicon`: Static assets.
- `e2e`: Playwright E2E tests and fixtures.
- `supabase`: SQL migrations and local config.
- `supabase-test`: Separate Supabase config for E2E tests (port 56XXX).
- `DEPLOYMENT.md`: Beginner-friendly production deployment guide for Vercel + Supabase.

## File Map

### Pages (`src/app`)
| Path | Purpose |
|------|---------|
| `page.tsx` | Home — leaderboard grid, nav to new match/practice/players |
| `new/page.tsx` | New match creation form |
| `match/[id]/page.tsx` | Match page (server component) |
| `match/[id]/MatchClient.tsx` | Main match client — orchestrates all hooks, switches scoring/spectator view |
| `games/page.tsx` | Recent games listing |
| `players/page.tsx` | Player management (list, create, toggle active) |
| `stats/page.tsx` | Stats and leaderboards |
| `leaderboards/page.tsx` | Detailed leaderboards |
| `elo-multi/page.tsx` | Multiplayer Elo leaderboard |
| `practice/page.tsx` | Practice mode (select player) |
| `practice/[playerId]/page.tsx` | Practice session for a player |

### API Routes (`src/app/api`)
| Route | Methods | Purpose |
|-------|---------|---------|
| `matches/` | POST | Create a new match |
| `matches/[matchId]/throws/` | POST, DELETE | Record or delete a dart throw |
| `matches/[matchId]/throws/[throwId]/` | PATCH, DELETE | Edit or delete a specific throw |
| `matches/[matchId]/turns/` | POST | Create a turn |
| `matches/[matchId]/turns/[turnId]/` | PATCH, DELETE | Finish a turn (score, bust); auto-resolves leg on fair ending |
| `matches/[matchId]/legs/[legId]/complete/` | POST | Complete a leg (set winner, create next leg or finalize match + Elo) |
| `matches/[matchId]/end/` | PATCH | End match early |
| `matches/[matchId]/rematch/` | POST | Create a rematch |
| `matches/[matchId]/players/` | POST | Add player to match |
| `matches/[matchId]/players/new/` | POST | Create new player and add to match |
| `matches/[matchId]/players/[playerId]/` | DELETE | Remove player from match |
| `matches/[matchId]/players/reorder/` | PATCH | Reorder players |
| `elo/update/` | POST | Update 1v1 Elo ratings |
| `elo-multi/update/` | POST | Update multiplayer Elo ratings |
| `players/` | GET, POST | List or create players |
| `practice/sessions/` | POST | Create practice session |
| `practice/sessions/[id]/end/` | PATCH | End practice session |
| `practice/sessions/[id]/throws/` | POST | Record practice throw |
| `around-world/sessions/` | POST | Create Around the World session |
| `commentary/` | POST | Generate AI commentary via LLM |
| `tts/` | POST | Text-to-speech for commentary |

### Utils (`src/utils`) — Pure Business Logic
| File | Purpose |
|------|---------|
| `x01.ts` | Core X01 game engine: `applyThrow()`, `calculate3DartAverage()` |
| `fairEnding.ts` | Fair ending state machine: `computeFairEndingState()`, `getNextFairEndingPlayer()` |
| `dartboard.ts` | Dartboard geometry: `computeHit()` from SVG coordinates, `segmentFromSelection()` |
| `eloRating.ts` | 1v1 Elo: `calculateNewEloRatings()`, leaderboard/stats queries |
| `eloRatingMultiplayer.ts` | Multiplayer Elo: `updateMatchEloRatingsMultiplayer()`, stats queries |
| `checkoutSuggestions.ts` | DFS checkout combinations for a remaining score |
| `checkoutTable.ts` | Pre-computed double-out checkout lookup table |
| `legScoreCalculator.ts` | Calculate remaining scores from turns/throws |
| `matchStats.ts` | Live spectator scores, round stats |
| `haptics.ts` | Mobile haptic feedback via `navigator.vibrate` |

### Hooks (`src/hooks`)
| File | Purpose |
|------|---------|
| `useMatchData.ts` | All match state loading: `loadAll()`, `loadAllSpectator()`, per-entity loaders |
| `useMatchActions.ts` | Player actions: `handleBoardClick`, `undoLastThrow`, `endLegAndMaybeMatch`, rematch, player management. Serializes concurrent throws via queue. |
| `useMatchRealtime.ts` | Connects Supabase realtime events to state; uses spectator reducer for incremental updates |
| `useRealtime.ts` | Low-level Supabase channel subscription, DOM custom events, connection lifecycle |
| `useCommentary.ts` | Commentary feature state, persona selection, TTS, localStorage persistence |
| `useMatchEloChanges.ts` | Fetches Elo changes after match completion |

### Lib (`src/lib`)
| Path | Purpose |
|------|---------|
| `match/types.ts` | Core types: `Player`, `MatchRecord`, `LegRecord`, `TurnRecord`, `ThrowRecord` |
| `match/selectors.ts` | Pure selectors: `selectCurrentPlayer`, `selectPlayerStats`, `canEditPlayers`, etc. |
| `match/loadMatchData.ts` | Parallel fetch of match + players + legs + turns from Supabase |
| `match/realtime.ts` | `PendingThrowBuffer`, realtime payload helpers |
| `match/spectatorRealtimeReducer.ts` | Pure reducer for spectator state from realtime events |
| `server/matchGuards.ts` | API route guards: `loadMatch()`, `isMatchActive()` |
| `server/completeLeg.ts` | Idempotent leg completion: winner, next leg creation, Elo RPC |
| `server/turnLifecycle.ts` | Race-tolerant turn creation, `resolveOrCreateTurnForPlayer()` |
| `server/recomputeLegTurns.ts` | Recomputes turn scores from raw throws after edits |
| `commentary/personas.ts` | AI commentary persona definitions |
| `commentary/promptBuilder.ts` | Builds LLM prompts from game context |
| `supabaseClient.ts` | Browser-side Supabase client (cached) |
| `supabaseServer.ts` | Server-side Supabase client (API routes) |
| `apiClient.ts` | Typed fetch wrapper: `apiRequest<T>()` |

### Components (`src/components`)
| File | Purpose |
|------|---------|
| `match/MatchScoringView.tsx` | Active scoring view — scores, dartboard/keypad, actions |
| `match/MatchSpectatorView.tsx` | Read-only spectator view |
| `match/MatchPlayersCard.tsx` | Player list with scores, averages, legs won |
| `match/EditThrowsModal.tsx` | Edit recorded throws in current leg |
| `match/EditPlayersModal.tsx` | Add/remove/reorder players |
| `match/EloChangesDisplay.tsx` | Elo rating changes after match |
| `Dartboard.tsx` | SVG interactive dartboard (desktop) |
| `MobileKeypad.tsx` | Touch number pad (mobile) |
| `GridLeaderboard.tsx` | Home page leaderboard grid |
| `EloLeaderboard.tsx` | 1v1 Elo leaderboard |
| `MultiEloLeaderboard.tsx` | Multiplayer Elo leaderboard |
| `AroundTheWorldGame.tsx` | Around the World game UI |
| `CommentaryDisplay.tsx` | AI commentary text display |
| `ScoreProgressChart.tsx` | Score progression chart |
| `TurnsHistoryCard.tsx` | Scrollable turns history for a leg |

### Test Utilities (`src/test-utils`)
| File | Purpose |
|------|---------|
| `factories.ts` | Test data factories: `createMockPlayer`, `createMockMatch`, `createMockLeg`, `createMockTurn`, `createMockThrow`, `createTwoPlayerGameSetup` |
| `mockSupabase.ts` | In-memory mock Supabase client with query builder operating on JS arrays |

## Build, Test, and Development Commands
- `npm run dev`: Start local dev server (Turbopack) at `http://localhost:3000`.
- `npm run build`: Create optimized production build.
- `npm start`: Run the built app in production mode.
- `npm run lint`: Lint with Next.js + ESLint config.
- `npm test`: Run tests in watch mode (interactive).
- `npm run test:run`: Run all tests once (for CI/CD).
- `npm run test:ui`: Open visual test interface.
- `npm run test:coverage`: Generate and display coverage report.
- `npm run test:e2e`: Run Playwright E2E tests (requires test Supabase instance).
- `npm run test:e2e:ui`: Run E2E tests with visual UI.
- `npm run test:e2e:headed`: Run E2E tests in a headed browser.
- `npm run supabase:test:start`: Start test Supabase instance (port 56XXX).
- `npm run supabase:test:stop`: Stop test Supabase instance.
- `npm run supabase:test:reset`: Reset test database.

## Coding Style & Naming Conventions
- **Language**: TypeScript (strict), React 19, Next.js 15.
- **Formatting/Linting**: ESLint (`next/core-web-vitals`, `next/typescript`). Keep imports ordered and unused code removed.
- **Components**: PascalCase files in `src/components` (e.g., `ScoreProgressChart.tsx`).
- **UI Primitives**: lower-kebab files in `src/components/ui` (e.g., `button.tsx`).
- **Utilities**: concise camelCase filenames in `src/utils` (e.g., `eloRating.ts`).
- **Styling**: Tailwind CSS; prefer utility classes over inline styles.
- **Typing**: Avoid using types like Any or Unknown when possible.
- **Next.js**: Prefer Server Components by default; use `"use client"` only when needed (interactivity, hooks, browser APIs).
- **Diffs**: Keep changes small and focused. No new dependencies without asking first.

## Testing Guidelines

### Unit Tests (Vitest)
- **Framework**: Vitest with TypeScript support, configured in `vitest.config.ts`.
- **Test Files**: Colocate tests with source files using `*.test.ts` or `*.test.tsx` (e.g., `x01.test.ts` next to `x01.ts`).
- **Naming**: Use descriptive test names with `describe()` and `it()` blocks.
- **Coverage**: Aim for high coverage on utility functions (90%+), moderate on components (70%+).
- **Best Practices**:
  - Keep tests deterministic; mock Supabase and network calls.
  - Test edge cases, boundary conditions, and error scenarios.
  - See `src/utils/x01.test.ts` for examples of comprehensive test coverage.
- **Running Tests**: Always run `npm run test:run` before committing to ensure all tests pass.

### E2E Tests (Playwright)
- **Framework**: Playwright, tests live in the `e2e/` directory.
- **Fixtures**: `e2e/fixtures.ts` provides Supabase client and test data helpers.
- **Test Supabase**: E2E tests use a separate Supabase instance (port 56XXX) to avoid conflicts with dev (port 554XX). Start it with `npm run supabase:test:start` before running E2E tests.
- **Running E2E Tests**: `npm run test:e2e` (headless), `npm run test:e2e:headed` (browser visible), `npm run test:e2e:ui` (visual UI).

## Commit & Pull Request Guidelines
- **Commits**: Short, imperative, and focused (e.g., `add elo leaderboard`, `fix build error`).
- **Branches**: `feature/<slug>`, `fix/<slug>`, `chore/<slug>`.
- **PRs**: Include concise description, rationale, screenshots for UI changes, and any Supabase schema notes. Link issues and note breaking changes.
- Ensure `npm run lint` and a successful local run before requesting review.

## Security & Configuration Tips
- Store secrets in `.env.local`; never commit keys. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Use Supabase RLS; avoid exposing privileged operations to the client.
- Be mindful of client bundles: don’t log secrets and avoid leaking PII.

## Architecture Notes
- Real-time and persistence via Supabase; charts via Highcharts React.
- Core game logic lives in `src/utils` and is shared across app routes and components.

### Key Flows

**Throw recording:**
`handleBoardClick` (useMatchActions) → optimistic local state → `POST /api/matches/:id/throws` → `resolveOrCreateTurnForPlayer` (turnLifecycle.ts) → insert throw → on 3rd dart: `PATCH /api/matches/:id/turns/:id` → if fair ending: `computeFairEndingState` → if resolved: `completeLeg` → Elo RPC.

**Spectator realtime:**
`useRealtime` subscribes to Supabase channel → dispatches DOM custom events → `useMatchRealtime` listens → `applyThrowChange/applyTurnChange` (spectatorRealtimeReducer) updates state incrementally → on `needsReconcile`: `loadAll()` full refresh.

**Fair ending:**
First player checks out → remaining players complete their turns in the round → if single checkout: leg resolved → if multiple checkouts: tiebreak rounds (3 darts each, highest score wins).

## Supabase Migration Rule
- Do not use `ALTER FUNCTION` in Supabase migrations. For function changes, use drop + recreate.
- Never modify existing Supabase migration files after they are created/committed.
- Any schema/function/policy change must be done by adding a new migration that supersedes earlier ones.

## Boundaries / Do Not Touch
- `.env*` files, secrets, production credentials.
- Existing migration files in `supabase/migrations/` — never edit, only add new ones.
- `package-lock.json` unless dependency changes are required.
- Generated artifacts (`coverage/`, `playwright-report/`, `.next/`, `node_modules/`).

## When You're Done
- `npm run lint` passes.
- `npm run build` succeeds.
- `npm run test:run` passes (add/update tests for behavior changes).
- Summarize what changed and how to verify locally.
