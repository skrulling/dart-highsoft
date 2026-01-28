import { test, expect, TEST_PLAYERS, addThrowsToTurn, createTurn } from './fixtures';

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
  // The spectator view disables polling when realtime is connected, so waiting for "Live"
  // ensures we're actually exercising the realtime path.
  const indicator = page.locator('div.fixed.bottom-4.right-4').first();
  await expect(indicator.getByText('Live')).toBeVisible({ timeout: 20000 });
}

function liveMatchCard(page: import('@playwright/test').Page) {
  return page.getByText('Live Match', { exact: true }).locator('..').locator('..');
}

function spectatorPlayerCard(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const name = card.locator('div.font-semibold.text-lg', { hasText: playerName }).first();
  // name -> flex gap container -> flex justify container -> card row container
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

test.describe('Realtime spectator sync', () => {
  test('spectator updates in real time while another client scores', async ({ page, context, supabase, createMatch }) => {
    const { matchId, legId } = await createMatch({ startScore: 301 });

    // Prepopulate a couple of completed turns so we're testing "mid-game" sync.
    const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
    await addThrowsToTurn(supabase, turn1.id, matchId, [
      { segment: 'S20', scored: 20, dart_index: 1 },
      { segment: 'S20', scored: 20, dart_index: 2 },
      { segment: 'S20', scored: 20, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn1.id);

    const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
    await addThrowsToTurn(supabase, turn2.id, matchId, [
      { segment: 'S20', scored: 20, dart_index: 1 },
      { segment: 'S20', scored: 20, dart_index: 2 },
      { segment: 'S20', scored: 20, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn2.id);

    // Scorer client (page)
    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Spectator client (second tab)
    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    // Initial state: Player One's turn; both players should be on 241.
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 241);
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.TWO, 241);

    // Throw 1: score 20, spectator should reflect the partial turn (241 -> 221).
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 221, { timeout: 10000 });
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);

    // Throw 2: another 20 (221 -> 201).
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 201, { timeout: 10000 });

    // Throw 3: completes the turn, so it becomes Player Two's turn and Player One is 181.
    await page.getByRole('button', { name: '20', exact: true }).click();
    await expectSpectatorPlayerScore(spectator, PLAYER_NAMES.ONE, 181, { timeout: 15000 });
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.TWO);

    await spectator.close();
  });
});

