import { test, expect, TEST_PLAYERS, addThrowsToTurn, createTurn } from './fixtures';

const SUPABASE_URL = 'http://127.0.0.1:56421';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
} as const;

async function waitForMatchLoad(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 15000 });
}

async function waitForSpectatorLoad(page: import('@playwright/test').Page) {
  await expect(page.getByText('Live Match', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function waitForRealtimeConnected(page: import('@playwright/test').Page) {
  const indicator = page.locator('div.fixed.bottom-4.right-4').first();
  await expect(indicator.getByText('Live')).toBeVisible({ timeout: 20000 });
}

function liveMatchCard(page: import('@playwright/test').Page) {
  return page.getByText('Live Match', { exact: true }).locator('..').locator('..');
}

function spectatorPlayerCard(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const name = card.locator('div.font-semibold.text-lg', { hasText: playerName }).first();
  return name.locator('..').locator('..').locator('..');
}

async function expectSpectatorPlayerScore(
  page: import('@playwright/test').Page,
  playerName: string,
  score: number,
  options?: { timeout?: number }
) {
  const row = spectatorPlayerCard(page, playerName);
  await expect(row.locator('div.text-3xl.font-mono.font-bold')).toHaveText(String(score), options);
}

async function expectSpectatorCurrentTurn(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const currentTurn = card.getByText('Current Turn', { exact: true }).locator('..');
  await expect(currentTurn.getByText(playerName, { exact: true })).toBeVisible({ timeout: 15000 });
}

function createSupabaseRequestCounter(page: import('@playwright/test').Page) {
  let count = 0;
  const handler = (req: import('@playwright/test').Request) => {
    if (req.resourceType() !== 'fetch') return;
    const url = req.url();
    if (!url.startsWith(SUPABASE_URL)) return;
    // Count REST calls only; websocket traffic is ignored via resourceType above.
    count += 1;
  };
  page.on('request', handler);

  return {
    reset() {
      count = 0;
    },
    getCount() {
      return count;
    },
    stop() {
      page.off('request', handler);
    },
  };
}

test.describe('Realtime isolation + performance budgets', () => {
  test('spectator ignores realtime events from other matches (no extra REST calls)', async ({
    context,
    supabase,
    createMatch,
  }) => {
    const { matchId: matchA, legId: legA } = await createMatch({ startScore: 301 });
    const { matchId: matchB, legId: legB } = await createMatch({ startScore: 301 });

    // Ensure match A has at least one known turn id so throw-based realtime filters can work.
    const turnA1 = await createTurn(supabase, legA, TEST_PLAYERS.ONE, 1);
    await addThrowsToTurn(supabase, turnA1.id, matchA, [{ segment: 'S20', scored: 20, dart_index: 1 }]);
    await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', turnA1.id);

    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchA}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    // Baseline UI state for match A.
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 281);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.TWO, 301);

    const counter = createSupabaseRequestCounter(spectator);
    // Give the page a moment to finish any late initial requests, then start counting.
    await spectator.waitForTimeout(250);
    counter.reset();

    // Create activity in match B that will emit realtime events for turns + throws.
    const turnB1 = await createTurn(supabase, legB, TEST_PLAYERS.ONE, 1);
    await addThrowsToTurn(supabase, turnB1.id, matchB, [{ segment: 'S20', scored: 20, dart_index: 1 }]);
    await supabase.from('turns').update({ total_scored: 0, busted: false }).eq('id', turnB1.id);

    // Allow time for realtime events to arrive and be ignored.
    await spectator.waitForTimeout(1500);

    expect(counter.getCount()).toBe(0);
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 281);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.TWO, 301);

    counter.stop();
    await spectator.close();
  });

  test('spectator stays in sync via polling when realtime is unavailable (catch-up)', async ({
    page,
    context,
    createMatch,
  }) => {
    const { matchId } = await createMatch({ startScore: 301 });

    // Scorer client.
    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Spectator client with WebSocket disabled so realtime cannot connect; it should fall back to polling.
    const spectator = await context.newPage();
    await spectator.addInitScript(() => {
      // Block ONLY Supabase realtime websockets so Next.js dev websocket stays functional.
      const NativeWebSocket = window.WebSocket;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).WebSocket = function WebSocket(url: string | URL, protocols?: string | string[]) {
        const rawUrl = typeof url === 'string' ? url : url.toString();
        if (rawUrl.includes('/realtime/v1/websocket')) {
          throw new Error('Supabase realtime websocket disabled for e2e polling test');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (NativeWebSocket as any)(url as any, protocols as any);
      };
      // Preserve prototype chain so callers relying on instanceof/prototype methods keep working.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).WebSocket.prototype = NativeWebSocket.prototype;
    });
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);

    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 301);

    // Score one dart; spectator should catch up within polling window.
    await page.getByRole('button', { name: '20', exact: true }).click();

    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 281, { timeout: 15000 });
    await spectator.close();
  });

  test('budget: scoring one dart should not trigger excessive Supabase REST traffic', async ({
    page,
    context,
    createMatch,
  }) => {
    const { matchId } = await createMatch({ startScore: 301 });

    // Scorer client.
    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Spectator client (realtime connected).
    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    const scorerCounter = createSupabaseRequestCounter(page);
    const spectatorCounter = createSupabaseRequestCounter(spectator);

    // Start counting after initial load settles.
    await page.waitForTimeout(250);
    scorerCounter.reset();
    spectatorCounter.reset();

    await page.getByRole('button', { name: '20', exact: true }).click();

    await expect(page.getByText('281 pts').first()).toBeVisible({ timeout: 15000 });
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 281, { timeout: 15000 });

    // These budgets are intentionally loose to prevent regressions while we optimize.
    expect(scorerCounter.getCount()).toBeLessThanOrEqual(15);
    expect(spectatorCounter.getCount()).toBeLessThanOrEqual(6);

    scorerCounter.stop();
    spectatorCounter.stop();
    await spectator.close();
  });
});
