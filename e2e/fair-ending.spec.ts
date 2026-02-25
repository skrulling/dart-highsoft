import { test, expect, TEST_PLAYERS, addThrowsToTurn, createTurn } from './fixtures';

const PLAYER_NAMES = {
  ONE: 'E2E Player One',
  TWO: 'E2E Player Two',
  THREE: 'E2E Player Three',
} as const;

async function waitForMatchLoad(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 15000 });
}

async function expectCurrentPlayer(page: import('@playwright/test').Page, name: string) {
  const upContainer = page.getByText('Up', { exact: true }).locator('..');
  await expect(upContainer.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
}

async function expectNoCurrentPlayer(page: import('@playwright/test').Page) {
  await expect(page.getByText('Up', { exact: true })).not.toBeVisible({ timeout: 5000 });
}

async function expectMatchScore(
  page: import('@playwright/test').Page,
  name: string,
  score: number,
  options?: { timeout?: number }
) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  const row = matchCard.getByText(name, { exact: true }).locator('..').locator('..');
  await expect(row.locator('div.text-2xl')).toHaveText(String(score), options ?? { timeout: 15000 });
}

async function expectCheckedOutBadge(page: import('@playwright/test').Page, name: string) {
  const matchCard = page.getByText('Match', { exact: true }).locator('..').locator('..');
  const row = matchCard.getByText(name, { exact: true }).locator('..').locator('..');
  await expect(row.getByText('Checked out')).toBeVisible({ timeout: 15000 });
}

async function expectBanner(page: import('@playwright/test').Page, text: string) {
  await expect(page.getByText(text, { exact: false })).toBeVisible({ timeout: 15000 });
}

async function expectWinner(page: import('@playwright/test').Page, name: string) {
  // The winner modal shows "Winner" / player name / "wins the match!"
  const winnerSection = page.getByText('wins the match', { exact: false }).locator('..');
  await expect(winnerSection).toBeVisible({ timeout: 15000 });
  await expect(winnerSection.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 });
}

async function throwDart(page: import('@playwright/test').Page, value: string, modifier?: 'Double' | 'Triple') {
  if (modifier) {
    await page.getByRole('button', { name: modifier }).click();
  }
  await page.getByRole('button', { name: value, exact: true }).click();
}

/**
 * Seeds the game so Player One has 20 remaining and Player Two has 20 remaining.
 * Both have completed 2 turns each (4 turns total). Player One is next up.
 *
 * 201 single_out:
 * - Turn 1 (P1): T20+T20+T20 = 180 -> score 21
 * - Turn 2 (P2): T20+T20+T20 = 180 -> score 21
 * - Turn 3 (P1): S1+Miss+Miss = 1 -> score 20
 * - Turn 4 (P2): S1+Miss+Miss = 1 -> score 20
 * Player One is next (turn 5).
 */
async function seedBothPlayersAt20(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  matchId: string,
  legId: string
) {
  const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
  await addThrowsToTurn(supabase, turn1.id, matchId, [
    { segment: 'T20', scored: 60, dart_index: 1 },
    { segment: 'T20', scored: 60, dart_index: 2 },
    { segment: 'T20', scored: 60, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn1.id);

  const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
  await addThrowsToTurn(supabase, turn2.id, matchId, [
    { segment: 'T20', scored: 60, dart_index: 1 },
    { segment: 'T20', scored: 60, dart_index: 2 },
    { segment: 'T20', scored: 60, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn2.id);

  const turn3 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 3);
  await addThrowsToTurn(supabase, turn3.id, matchId, [
    { segment: 'S1', scored: 1, dart_index: 1 },
    { segment: 'Miss', scored: 0, dart_index: 2 },
    { segment: 'Miss', scored: 0, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn3.id);

  const turn4 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 4);
  await addThrowsToTurn(supabase, turn4.id, matchId, [
    { segment: 'S1', scored: 1, dart_index: 1 },
    { segment: 'Miss', scored: 0, dart_index: 2 },
    { segment: 'Miss', scored: 0, dart_index: 3 },
  ]);
  await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn4.id);
}

/**
 * Seeds a 3-player game so all players have 20 remaining.
 * 201 single_out:
 * - Turn 1 (P1): T20+T20+T20 = 180 -> score 21
 * - Turn 2 (P2): T20+T20+T20 = 180 -> score 21
 * - Turn 3 (P3): T20+T20+T20 = 180 -> score 21
 * - Turn 4 (P1): S1+Miss+Miss = 1 -> score 20
 * - Turn 5 (P2): S1+Miss+Miss = 1 -> score 20
 * - Turn 6 (P3): S1+Miss+Miss = 1 -> score 20
 * Player One is next (turn 7).
 */
async function seedThreePlayersAt20(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  matchId: string,
  legId: string
) {
  const playerIds = [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO, TEST_PLAYERS.THREE];

  // Round 1: all players score 180 (T20+T20+T20)
  for (let i = 0; i < 3; i++) {
    const turn = await createTurn(supabase, legId, playerIds[i], i + 1);
    await addThrowsToTurn(supabase, turn.id, matchId, [
      { segment: 'T20', scored: 60, dart_index: 1 },
      { segment: 'T20', scored: 60, dart_index: 2 },
      { segment: 'T20', scored: 60, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn.id);
  }

  // Round 2: all players score 1 (S1+Miss+Miss)
  for (let i = 0; i < 3; i++) {
    const turn = await createTurn(supabase, legId, playerIds[i], i + 4);
    await addThrowsToTurn(supabase, turn.id, matchId, [
      { segment: 'S1', scored: 1, dart_index: 1 },
      { segment: 'Miss', scored: 0, dart_index: 2 },
      { segment: 'Miss', scored: 0, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn.id);
  }
}

test.describe('Fair Ending', () => {
  test('Player One checks out, Player Two completes round without checking out -> Player One wins', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One is up with 20 remaining
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await expectMatchScore(page, PLAYER_NAMES.ONE, 20);

    // Player One checks out: S20 (20 -> 0)
    await throwDart(page, '20');

    // Fair ending: should show "Completing round" banner and Player Two should be up
    await expectBanner(page, 'Completing round');
    await expectCheckedOutBadge(page, PLAYER_NAMES.ONE);
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // Player Two throws 3 darts, doesn't check out (misses)
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player One should win since only they checked out
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Both players check out -> tiebreak, higher scorer wins', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Completing round: Player Two is up
    await expectBanner(page, 'Completing round');
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // Player Two also checks out: S20
    await throwDart(page, '20');

    // Both checked out -> tiebreak should start
    await expectBanner(page, 'Tiebreak');
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);

    // Tiebreak round 1: Player One throws low (3 x S1 = 3)
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player Two's turn in tiebreak
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // Player Two throws high (3 x S20 = 60)
    await throwDart(page, '20');
    await throwDart(page, '20');
    await throwDart(page, '20');

    // Player Two wins the tiebreak (60 > 3)
    await expectWinner(page, PLAYER_NAMES.TWO);
  });

  test('Tiebreak tie leads to another round', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Both players check out
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20'); // P1 checks out

    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '20'); // P2 checks out

    // Tiebreak round 1
    await expectBanner(page, 'Tiebreak');

    // Both score the same: 3 x S20 = 60 each
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');
    await throwDart(page, '20');
    await throwDart(page, '20');

    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '20');
    await throwDart(page, '20');
    await throwDart(page, '20');

    // Tied! Should still be in tiebreak (round 2)
    await expectBanner(page, 'Tiebreak');
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);

    // Round 2: Player One scores higher
    await throwDart(page, '20');
    await throwDart(page, '20');
    await throwDart(page, '20');

    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player One wins (60 > 3)
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Player One checks out with first dart, remaining darts are not needed', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out with first dart: S20 (checkout finishes the turn immediately)
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Should immediately go to completing_round, Player Two is up
    await expectCheckedOutBadge(page, PLAYER_NAMES.ONE);
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await expectMatchScore(page, PLAYER_NAMES.TWO, 20);
  });

  test('Player Two busts during completing round -> Player One still wins', async ({
    page,
    supabase,
    createMatch,
  }) => {
    // Use double_out so P2 can bust by hitting a single when needing a double
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'double_out',
      fairEnding: true,
    });

    // Seed: both players at 20 remaining (double_out: need D10 to finish)
    const turn1 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 1);
    await addThrowsToTurn(supabase, turn1.id, matchId, [
      { segment: 'T20', scored: 60, dart_index: 1 },
      { segment: 'T20', scored: 60, dart_index: 2 },
      { segment: 'T20', scored: 60, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn1.id);

    const turn2 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 2);
    await addThrowsToTurn(supabase, turn2.id, matchId, [
      { segment: 'T20', scored: 60, dart_index: 1 },
      { segment: 'T20', scored: 60, dart_index: 2 },
      { segment: 'T20', scored: 60, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 180, busted: false }).eq('id', turn2.id);

    const turn3 = await createTurn(supabase, legId, TEST_PLAYERS.ONE, 3);
    await addThrowsToTurn(supabase, turn3.id, matchId, [
      { segment: 'S1', scored: 1, dart_index: 1 },
      { segment: 'Miss', scored: 0, dart_index: 2 },
      { segment: 'Miss', scored: 0, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn3.id);

    const turn4 = await createTurn(supabase, legId, TEST_PLAYERS.TWO, 4);
    await addThrowsToTurn(supabase, turn4.id, matchId, [
      { segment: 'S1', scored: 1, dart_index: 1 },
      { segment: 'Miss', scored: 0, dart_index: 2 },
      { segment: 'Miss', scored: 0, dart_index: 3 },
    ]);
    await supabase.from('turns').update({ total_scored: 1, busted: false }).eq('id', turn4.id);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Both at 20, double_out. P1 checks out with D10
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '10', 'Double');

    // Completing round: P2 is up
    await expectBanner(page, 'Completing round');
    await expectCheckedOutBadge(page, PLAYER_NAMES.ONE);
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // P2 throws S20 which busts (20 -> 0, but needs a double to finish in double_out)
    await throwDart(page, '20');

    // P1 should win since P2 busted
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Normal game without fair ending ends immediately on checkout', async ({
    page,
    supabase,
    createMatch,
  }) => {
    // Regression: ensure non-fair-ending games still work normally
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: false,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20 -> immediate win, no completing round
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Should immediately show winner, NOT "Completing round"
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Game does not end prematurely when last player starts throwing during completing_round', async ({
    page,
    supabase,
    createMatch,
  }) => {
    // Regression: reproduces a bug where the game ended after the last player threw their
    // first dart during completing_round. The realtime-inserted turn (total_scored=0, 1 throw)
    // was incorrectly counted as a completed turn, making the fair ending logic think the
    // round was over and immediately resolving the winner.
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20 (20 -> 0)
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Completing round: Player Two is up with 20 remaining
    await expectBanner(page, 'Completing round');
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await expectMatchScore(page, PLAYER_NAMES.TWO, 20);

    // Player Two throws first dart (S5 -> 15 remaining)
    await throwDart(page, '5');

    // BUG: the game used to end here. It should NOT have ended.
    // Player Two should still be throwing (15 remaining, dart 2 of 3)
    await expectMatchScore(page, PLAYER_NAMES.TWO, 15, { timeout: 5000 });

    // Player Two can throw darts 2 and 3
    await throwDart(page, '1');
    await throwDart(page, '1');

    // NOW the round is complete (P2 finished their turn without checking out) → P1 wins
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('3-player: P1 checks out, P2 and P3 complete round → P1 wins', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO, TEST_PLAYERS.THREE],
    });
    await seedThreePlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One is up with 20 remaining
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await expectMatchScore(page, PLAYER_NAMES.ONE, 20);

    // Player One checks out: S20 (20 -> 0)
    await throwDart(page, '20');

    // Fair ending: completing round
    await expectBanner(page, 'Completing round');
    await expectCheckedOutBadge(page, PLAYER_NAMES.ONE);

    // Player Two throws without checking out
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player Three throws without checking out
    await expectCurrentPlayer(page, PLAYER_NAMES.THREE);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player One wins
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('3-player: P1 and P3 check out → tiebreak, P3 wins', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO, TEST_PLAYERS.THREE],
    });
    await seedThreePlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Completing round
    await expectBanner(page, 'Completing round');

    // Player Two does NOT check out
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Player Three checks out: S20
    await expectCurrentPlayer(page, PLAYER_NAMES.THREE);
    await throwDart(page, '20');

    // Tiebreak between P1 and P3
    await expectBanner(page, 'Tiebreak');

    // P1 throws low (3 x S1 = 3)
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // P3 throws high (3 x S20 = 60)
    await expectCurrentPlayer(page, PLAYER_NAMES.THREE);
    await throwDart(page, '20');
    await throwDart(page, '20');
    await throwDart(page, '20');

    // P3 wins (60 > 3)
    await expectWinner(page, PLAYER_NAMES.THREE);
  });

  test('All misses during completing round still resolves winner', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Completing round
    await expectBanner(page, 'Completing round');
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // Player Two throws 3 misses (0 button = miss)
    await throwDart(page, '0 (Miss)');
    await throwDart(page, '0 (Miss)');
    await throwDart(page, '0 (Miss)');

    // P1 wins (3 misses = complete turn, P2 didn't check out)
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Completing round player can throw all 3 darts (selector passes throw_count)', async ({
    page,
    supabase,
    createMatch,
  }) => {
    // Regression: validates the selector passes throw_count correctly.
    // Without the fix, the game gets stuck after the completing-round player's first dart.
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out: S20
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Completing round: Player Two is up
    await expectBanner(page, 'Completing round');
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);

    // Player Two throws first dart (S5 -> 15 remaining)
    await throwDart(page, '5');

    // Player Two should still be current player (can throw darts 2 and 3)
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await expectMatchScore(page, PLAYER_NAMES.TWO, 15, { timeout: 5000 });

    // Player Two throws darts 2 and 3
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Round complete, P1 wins
    await expectWinner(page, PLAYER_NAMES.ONE);
  });

  test('Elo is only applied once after fair ending win', async ({
    page,
    supabase,
    createMatch,
  }) => {
    const { matchId, legId } = await createMatch({
      startScore: 201,
      finish: 'single_out',
      fairEnding: true,
    });
    await seedBothPlayersAt20(supabase, matchId, legId);

    await page.goto(`/match/${matchId}`);
    await waitForMatchLoad(page);

    // Player One checks out
    await expectCurrentPlayer(page, PLAYER_NAMES.ONE);
    await throwDart(page, '20');

    // Player Two completes round without checking out
    await expectBanner(page, 'Completing round');
    await expectCurrentPlayer(page, PLAYER_NAMES.TWO);
    await throwDart(page, '1');
    await throwDart(page, '1');
    await throwDart(page, '1');

    // Wait for winner and Elo to settle
    await expectWinner(page, PLAYER_NAMES.ONE);
    await page.waitForTimeout(2000);

    // Check elo_ratings records for this specific match - should be exactly 1 per player
    const { data: eloRecords } = await supabase
      .from('elo_ratings')
      .select('player_id, rating_change, is_winner')
      .eq('match_id', matchId);

    // Exactly 2 records (1 winner + 1 loser), not 4 (which would mean double application)
    expect(eloRecords).toHaveLength(2);

    const winnerRecord = eloRecords?.find((r: { is_winner: boolean }) => r.is_winner);
    const loserRecord = eloRecords?.find((r: { is_winner: boolean }) => !r.is_winner);

    expect(winnerRecord).toBeDefined();
    expect(loserRecord).toBeDefined();
    expect(winnerRecord!.rating_change).toBeGreaterThan(0);
    expect(winnerRecord!.rating_change).toBeLessThanOrEqual(32);
    expect(loserRecord!.rating_change).toBeLessThan(0);
    expect(loserRecord!.rating_change).toBeGreaterThanOrEqual(-32);
  });
});
