# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Stack
- Next.js
- Shadcn ui
- Supabase
- lucide icons

## Development Commands

```bash
# Start development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Run tests in watch mode
npm test

# Run tests once (for CI)
npm run test:run

# Run tests with visual UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run E2E tests (requires test Supabase instance)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed browser
npm run test:e2e:headed

# Start test Supabase instance (port 56XXX)
npm run supabase:test:start

# Stop test Supabase instance
npm run supabase:test:stop

# Reset test database
npm run supabase:test:reset
```

## Testing

The project uses **Vitest** for unit testing and **Playwright** for E2E testing.

### Test Structure
- Test files are colocated with source files: `filename.test.ts`
- Tests use Vitest's Jest-compatible API
- Configuration in `vitest.config.ts`

### Current Coverage
- **X01 Game Logic** (`src/utils/x01.ts`): 100% coverage with 42 test cases
  - Both single-out and double-out finish rules
  - All bust scenarios (going below 0, landing on 1, non-double finish)
  - Edge cases and boundary conditions

### Writing Tests
```typescript
import { describe, it, expect } from 'vitest';

describe('My Function', () => {
  it('should handle expected case', () => {
    const result = myFunction(input);
    expect(result).toEqual(expectedOutput);
  });
});
```

### Running Tests During Development
- Use `npm test` for watch mode - tests re-run on file changes
- Use `npm run test:ui` for a visual interface to browse and run tests
- Always run `npm run test:run` before committing to ensure all tests pass

### E2E Testing with Playwright

E2E tests use a **separate Supabase instance** on port 56XXX to avoid conflicts with the main development instance (port 554XX).

**Setup:**
1. Start the test Supabase instance: `npm run supabase:test:start`
2. Run E2E tests: `npm run test:e2e`
3. Stop test Supabase: `npm run supabase:test:stop`

**Test Structure:**
- E2E tests are in the `e2e/` directory
- Fixtures in `e2e/fixtures.ts` provide Supabase client and test data helpers
- Tests use Playwright's test API

**Writing E2E Tests:**
```typescript
import { test, expect, TEST_PLAYERS } from './fixtures';

test('can throw a dart', async ({ page, createMatch }) => {
  const { matchId } = await createMatch({ startScore: 501 });
  await page.goto(`/match/${matchId}`);

  // Interact with the UI
  await page.getByRole('button', { name: '20' }).click();

  // Assert results
  await expect(page.getByText('481 pts')).toBeVisible();
});
```

**Test Supabase Configuration:**
- Config file: `supabase-test/config.toml`
- API port: 56421 (vs 55421 for dev)
- DB port: 56422 (vs 55422 for dev)
- Migrations are symlinked from `supabase/migrations`

## Database Operations

This project uses Supabase as the backend database. Database migrations are stored in `supabase/migrations/` and should be applied via the Supabase dashboard SQL editor or CLI:

```sql
-- Example: Apply RLS policies for new tables
-- Run these SQL commands in Supabase dashboard SQL editor
```

When adding new database operations that require DELETE or UPDATE permissions, ensure RLS policies are updated. The pattern is:
```sql
create policy "public update" on public.table_name for update using (true) with check (true);
create policy "public delete" on public.table_name for delete using (true);
```

## Architecture Overview

### Core Game Logic
- **X01 Game Engine** (`src/utils/x01.ts`): Handles dart scoring logic, bust rules, and finish conditions
- **Dartboard Utilities** (`src/utils/dartboard.ts`): Manages dartboard segment calculations and hit detection
- **Haptics** (`src/utils/haptics.ts`): Mobile haptic feedback integration

### Data Model
- **Players**: Managed globally, referenced by matches
- **Matches**: Container for game settings (start score, finish rule, legs to win)
- **Match Players**: Junction table with play order for player rotation
- **Legs**: Individual games within a match, tracks starting player and winner
- **Turns**: Player attempts within a leg, stores total score and bust status
- **Throws**: Individual dart throws within a turn (1-3 per turn)

### Key Components
- **MatchClient**: Main match interface handling game state, player rotation, scoring, and real-time updates
- **MobileKeypad**: Touch-friendly dart score input for mobile devices
- **Dartboard**: Desktop dartboard component for click-based scoring

### State Management Pattern
The app uses React state with Supabase for persistence. Key patterns:
- `loadAll()` function refreshes all match data after database changes
- Real-time turn management with `ongoingTurnRef` for incomplete turns
- Player rotation based on turn count and starting player order
- Leg completion triggers match winner calculation

### Player Management
Players can be added/removed during matches before the first round completes. The system:
- Maintains play order through `play_order` field in `match_players`
- Reorders remaining players sequentially after removals
- Adds new players at the end of play queue
- Prevents removal when fewer than 2 players remain

### Mobile Responsiveness
The UI adapts between mobile keypad and desktop dartboard input. Layout considerations:
- Modal components use responsive widths and proper mobile padding
- Button layouts use flex-wrap for small screens
- Spacing is optimized for mobile (`space-y-3` on mobile, `space-y-6` on desktop)

## Environment Configuration

The app requires Supabase environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Known Database Schema Requirements

When implementing new features that modify player/match relationships, ensure proper RLS policies exist. Common missing policies that cause permission errors:
- UPDATE policies for reordering players
- DELETE policies for removing players from matches
- CASCADE constraints for data cleanup

The current migration files provide the baseline schema, with migrations 0007+ handling edit permissions for throws/turns and 0008+ handling match player modifications.