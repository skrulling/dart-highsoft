import { test, expect, TEST_PLAYERS, addThrowsToTurn, createTurn } from './fixtures';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
  THREE: 'E2E Player Three',
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

async function expectSpectatorCurrentTurn(page: import('@playwright/test').Page, playerName: string) {
  const card = liveMatchCard(page);
  const currentTurn = card.getByText('Current Turn', { exact: true }).locator('..');
  await expect(currentTurn.getByText(playerName, { exact: true })).toBeVisible({ timeout: 15000 });
}

function legsSummaryCard(page: import('@playwright/test').Page) {
  return page.getByText('Legs Summary', { exact: true }).locator('..').locator('..');
}

async function expectLegRowContains(page: import('@playwright/test').Page, legNumber: number, text: string) {
  const card = legsSummaryCard(page);
  const row = card.getByText(`Leg ${legNumber}`, { exact: false }).locator('..');
  await expect(row).toContainText(text, { timeout: 15000 });
}

async function expectCurrentPlayer(page: import('@playwright/test').Page, name: string) {
  // Match view uses the "Up" badge on the current player's row.
  const upContainer = page.getByText('Up', { exact: true }).locator('..');
  await expect(upContainer.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
}

async function expectMatchScore(
  page: import('@playwright/test').Page,
  name: string,
  score: number,
  options?: { timeout?: number }
) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  const row = matchCard.getByText(name, { exact: true }).locator('..').locator('..');
  await expect(row.locator('div.text-2xl')).toHaveText(String(score), options);
}

async function click20AndWaitPts(page: import('@playwright/test').Page, playerName: string, pts: number) {
  await page.getByRole('button', { name: '20', exact: true }).click();
  await expectMatchScore(page, playerName, pts, { timeout: 15000 });
}

async function click20AndWaitTurnChange(
  page: import('@playwright/test').Page,
  nextPlayerName: string,
  nextPlayerScore: number,
  previousPlayerName: string,
  nextPts: number
) {
  await page.getByRole('button', { name: '20', exact: true }).click();
  await expectCurrentPlayer(page, nextPlayerName);
  await expectMatchScore(page, nextPlayerName, nextPlayerScore, { timeout: 15000 });
  await expectMatchScore(page, previousPlayerName, nextPts, { timeout: 15000 });
}

test.describe('Realtime leg/match transitions + multiplayer rotation', () => {
  async function seedPlayerOneAt40AndUp(
    supabase: import('@supabase/supabase-js').SupabaseClient,
    matchId: string,
    legId: string
  ) {
    // Start score is 301. After these turns:
    // - Player One: 301 - (180 + 81) = 40
    // - Player Two: 301 - (60 + 60) = 181
    // Last completed turn is Player Two, so Player One is Up.
    const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
    await addThrowsToTurn(supabase, turn1.id, matchId, [
      { segment: 'T20', scored: 60, dart_index: 1 },
      { segment: 'T20', scored: 60, dart_index: 2 },
      { segment: 'T20', scored: 60, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn1.id);

    const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
    await addThrowsToTurn(supabase, turn2.id, matchId, [
      { segment: 'S20', scored: 20, dart_index: 1 },
      { segment: 'S20', scored: 20, dart_index: 2 },
      { segment: 'S20', scored: 20, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn2.id);

    const turn3 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 3);
    await addThrowsToTurn(supabase, turn3.id, matchId, [
      { segment: 'T20', scored: 60, dart_index: 1 },
      { segment: 'S20', scored: 20, dart_index: 2 },
      { segment: 'S1', scored: 1, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 81, busted: false }).eq('id', turn3.id);

    const turn4 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 4);
    await addThrowsToTurn(supabase, turn4.id, matchId, [
      { segment: 'S20', scored: 20, dart_index: 1 },
      { segment: 'S20', scored: 20, dart_index: 2 },
      { segment: 'S20', scored: 20, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 60, busted: false }).eq('id', turn4.id);
  }

  test('leg win creates next leg and rotates starter (spectator updates)', async ({
    page,
    context,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({ startScore: 301, finish: 'double_out', legsToWin: 2 });
    await seedPlayerOneAt40AndUp(supabase, matchId, legId);

    // Scorer client.
    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Spectator client.
    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.ONE);

    // Finish leg 1 immediately: D20 from 40 (double-out).
    await page.getByRole('button', { name: 'Double' }).click();
    await page.getByRole('button', { name: '20', exact: true }).click();

    // Spectator should move to leg 2 and starter should rotate to Player Two.
    await expectSpectatorCurrentTurn(spectator, PLAYER_NAMES.TWO);
    await expectLegRowContains(spectator, 1, PLAYER_NAMES.ONE);
    await expectLegRowContains(spectator, 2, 'In Progress');

    await spectator.close();
  });

  test('match win shows winner on spectator in real time', async ({ page, context, supabase, createMatch }) => {
    const { matchId, legId } = await createMatch({ startScore: 301, finish: 'double_out', legsToWin: 1 });
    await seedPlayerOneAt40AndUp(supabase, matchId, legId);

    // Scorer client.
    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Spectator client.
    const spectator = await context.newPage();
    await spectator.goto(`/match/${matchId}?spectator=true`);
    await waitForSpectatorLoad(spectator);
    await waitForRealtimeConnected(spectator);

    // Win the match: one leg needed.
    await page.getByRole('button', { name: 'Double' }).click();
    await page.getByRole('button', { name: '20', exact: true }).click();

    // Spectator should show the match winner card.
    await expect(spectator.getByText(`${PLAYER_NAMES.ONE} Wins!`, { exact: true })).toBeVisible({ timeout: 15000 });
    await spectator.close();
  });

  test('3-player rotation: completes turns and rotates Up across all players', async ({ page, createMatch }) => {
    const { matchId } = await createMatch({
      startScore: 301,
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO, TEST_PLAYERS.THREE],
    });

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);

    // Player 1: 3 darts
    await click20AndWaitPts(page, PLAYER_NAMES.ONE, 281);
    await click20AndWaitPts(page, PLAYER_NAMES.ONE, 261);
    await click20AndWaitTurnChange(page, PLAYER_NAMES.TWO, 301, PLAYER_NAMES.ONE, 241);

    // Player 2: 3 darts
    await click20AndWaitPts(page, PLAYER_NAMES.TWO, 281);
    await click20AndWaitPts(page, PLAYER_NAMES.TWO, 261);
    await click20AndWaitTurnChange(page, PLAYER_NAMES.THREE, 301, PLAYER_NAMES.TWO, 241);

    // Player 3: 3 darts -> wraps back to Player 1
    await click20AndWaitPts(page, PLAYER_NAMES.THREE, 281);
    await click20AndWaitPts(page, PLAYER_NAMES.THREE, 261);
    await click20AndWaitTurnChange(page, PLAYER_NAMES.ONE, 241, PLAYER_NAMES.THREE, 241);
  });
});
