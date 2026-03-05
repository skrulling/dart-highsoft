import {
  test,
  expect,
  TEST_PLAYERS,
  TEST_PLAYER_NAMES,
  completeTournamentMatchViaApi,
  getTournamentState,
  seedMatchToNearCompletion,
  cleanupTournamentData,
} from './fixtures';
import type { SupabaseClient } from '@supabase/supabase-js';

function playerName(id: string | null): string {
  if (!id) return 'TBD';
  return TEST_PLAYER_NAMES[id] ?? 'Unknown';
}

async function waitForMatchLoad(page: import('@playwright/test').Page) {
  await expect(page.getByRole('button', { name: 'Undo dart' })).toBeVisible({ timeout: 15000 });
}

async function throwDart(
  page: import('@playwright/test').Page,
  value: string,
  modifier?: 'Double' | 'Triple'
) {
  if (modifier) {
    await page.getByRole('button', { name: modifier }).click();
  }
  await page.getByRole('button', { name: value, exact: true }).click();
}

/**
 * Complete all matches through LB R2, setting up for Grand Final.
 *
 * 4-player double-elimination bracket:
 *   WB R1-0: player1 wins → WB R2, player2 loses → LB R1
 *   WB R1-1: player1 wins → WB R2, player2 loses → LB R1
 *   LB R1:   wbR1-0 loser (D) wins over wbR1-1 loser (C) → C eliminated (rank 4)
 *   WB R2:   wbR1-0 winner (A) wins over wbR1-1 winner (B) → B drops to LB R2
 *   LB R2:   D wins over B → B eliminated (rank 3)
 *
 * Returns { wbChamp, lbChamp, rank3, rank4 } for Grand Final tests.
 */
async function completeToGrandFinal(supabase: SupabaseClient, tournamentId: string) {
  let state = await getTournamentState(supabase, tournamentId);
  const wbR1 = state
    .filter((m) => m.bracket === 'winners' && m.round === 1 && !m.is_bye)
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position);

  const winnerA = wbR1[0].player1_id!;
  const loserD = wbR1[0].player2_id!;
  const winnerB = wbR1[1].player1_id!;
  const loserC = wbR1[1].player2_id!;

  // WB R1
  await completeTournamentMatchViaApi(supabase, wbR1[0].id, winnerA);
  await completeTournamentMatchViaApi(supabase, wbR1[1].id, winnerB);

  // LB R1: loserD wins, loserC eliminated (rank 4)
  state = await getTournamentState(supabase, tournamentId);
  const lbR1 = state.filter((m) => m.bracket === 'losers' && m.round === 1);
  await completeTournamentMatchViaApi(supabase, lbR1[0].id, loserD);

  // WB R2: winnerA wins, winnerB drops to LB R2
  state = await getTournamentState(supabase, tournamentId);
  const wbR2 = state.filter((m) => m.bracket === 'winners' && m.round === 2);
  await completeTournamentMatchViaApi(supabase, wbR2[0].id, winnerA);

  // LB R2: loserD wins, winnerB eliminated (rank 3)
  state = await getTournamentState(supabase, tournamentId);
  const lbR2 = state.filter((m) => m.bracket === 'losers' && m.round === 2);
  await completeTournamentMatchViaApi(supabase, lbR2[0].id, loserD);

  return { wbChamp: winnerA, lbChamp: loserD, rank3: winnerB, rank4: loserC };
}

test.describe('Tournament', () => {
  test('creation via UI', async ({ page, supabase }) => {
    // Ensure test players exist
    const playerRows = Object.entries(TEST_PLAYER_NAMES).map(([id, name]) => ({
      id,
      display_name: name,
    }));
    await supabase.from('players').upsert(playerRows, { onConflict: 'id' });

    let tournamentId: string | undefined;
    try {
      await page.goto('/tournament/new');

      // Fill in tournament name
      await page.getByPlaceholder('e.g. Friday Night Darts').fill('E2E UI Tournament');

      // Select 4 players via checkboxes
      for (const name of Object.values(TEST_PLAYER_NAMES)) {
        await page.locator('label').filter({ hasText: name }).click();
      }

      // Change start score from 501 to 201
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: '201' }).click();

      // Change finish rule from Double out to Single out
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'Single out' }).click();

      // Click "Start Tournament"
      await page.getByRole('button', { name: 'Start Tournament' }).click();

      // Verify redirect to tournament page
      await expect(page).toHaveURL(/\/tournament\/[0-9a-f-]+/, { timeout: 15000 });
      tournamentId = page.url().split('/tournament/')[1]?.split('?')[0];

      // Verify bracket page renders
      await expect(page.getByText('E2E UI Tournament')).toBeVisible();
      await expect(page.getByText('In Progress')).toBeVisible();
      await expect(page.getByText('Winners Bracket')).toBeVisible();

      // WB R1 match cards show player names and LIVE badges
      await expect(page.getByText('LIVE').first()).toBeVisible();
    } finally {
      if (tournamentId) {
        await cleanupTournamentData(supabase, tournamentId);
      }
    }
  });

  test('bracket page structure for 4 players', async ({ page, createTournament }) => {
    const { tournamentId } = await createTournament();

    await page.goto(`/tournament/${tournamentId}`);

    // Verify bracket sections
    await expect(page.getByText('Winners Bracket')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Losers Bracket')).toBeVisible();
    await expect(page.getByText('Grand Final')).toBeVisible();

    // Verify WB R1 label
    await expect(page.getByText('WB R1')).toBeVisible();

    // Verify 2 LIVE match cards in WB R1
    const liveBadges = page.getByText('LIVE');
    await expect(liveBadges).toHaveCount(2);

    // Verify WB R2 shows TBD (no players yet)
    await expect(page.getByText('TBD').first()).toBeVisible();

    // Verify standings section with all 4 players active
    await expect(page.getByText('Standings')).toBeVisible();
    const activeBadges = page.getByText('Active', { exact: true });
    await expect(activeBadges).toHaveCount(4);
  });

  test('play tournament match through UI and Back to Bracket', async ({
    page,
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament();
    const state = await getTournamentState(supabase, tournamentId);

    // Seed all WB R1 matches so any one is ready for checkout
    const wbR1Matches = state.filter(
      (m) => m.bracket === 'winners' && m.round === 1 && m.match_id && !m.is_bye
    );
    for (const wbMatch of wbR1Matches) {
      const { data: leg } = await supabase
        .from('legs')
        .select('id')
        .eq('match_id', wbMatch.match_id)
        .order('leg_number')
        .limit(1)
        .single();
      const { data: mp } = await supabase
        .from('match_players')
        .select('player_id')
        .eq('match_id', wbMatch.match_id)
        .order('play_order');
      if (leg && mp && mp.length >= 2) {
        await seedMatchToNearCompletion(
          supabase,
          wbMatch.match_id!,
          leg.id,
          mp[0].player_id,
          mp[1].player_id
        );
      }
    }

    // Navigate to tournament page
    await page.goto(`/tournament/${tournamentId}`);
    await expect(page.getByText('Winners Bracket')).toBeVisible({ timeout: 15000 });

    // Click a LIVE match card
    await page.getByText('LIVE').first().click();

    // Verify navigation to match page
    await expect(page).toHaveURL(/\/match\//, { timeout: 15000 });

    // Wait for match to load
    await waitForMatchLoad(page);

    // Throw S20 to check out (whoever is up, both players at 20 remaining)
    await throwDart(page, '20');

    // Verify winner modal
    await expect(page.getByText('wins the match', { exact: false })).toBeVisible({
      timeout: 15000,
    });

    // Verify "Back to Bracket" shows (not "Rematch") — tournament context
    const backLink = page.getByRole('link', { name: 'Back to Bracket' }).last();
    await expect(backLink).toBeVisible();

    // Click "Back to Bracket"
    await backLink.click();

    // Verify return to tournament page
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}`), { timeout: 15000 });
    await expect(page.getByText('Winners Bracket')).toBeVisible();
  });

  test('full 4-player tournament — WB champion wins Grand Final', async ({
    page,
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament();
    const { wbChamp } = await completeToGrandFinal(supabase, tournamentId);

    // GF Match 1: WB champ wins → tournament complete
    const state = await getTournamentState(supabase, tournamentId);
    const gf1 = state.filter((m) => m.bracket === 'grand_final' && m.round === 1);
    await completeTournamentMatchViaApi(supabase, gf1[0].id, wbChamp);

    // Navigate and verify
    await page.goto(`/tournament/${tournamentId}`);

    // Tournament completed
    await expect(page.getByText('Completed')).toBeVisible({ timeout: 15000 });

    // Winner banner shows WB champ
    await expect(page.getByText('Tournament Winner')).toBeVisible();
    await expect(page.locator('.font-extrabold')).toHaveText(playerName(wbChamp));

    // Standings show all 4 ranks
    await expect(page.getByText('1st')).toBeVisible();
    await expect(page.getByText('2nd')).toBeVisible();
    await expect(page.getByText('3rd')).toBeVisible();
    await expect(page.getByText('4th')).toBeVisible();

    // No more LIVE matches
    await expect(page.getByText('LIVE')).toHaveCount(0);
  });

  test('full 4-player tournament — GF Reset path, WB champ wins reset', async ({
    page,
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament();
    const { wbChamp, lbChamp } = await completeToGrandFinal(supabase, tournamentId);

    // GF Match 1: LB champ wins → NOT complete, triggers reset
    let state = await getTournamentState(supabase, tournamentId);
    const gf1 = state.filter((m) => m.bracket === 'grand_final' && m.round === 1);
    await completeTournamentMatchViaApi(supabase, gf1[0].id, lbChamp);

    // Verify tournament is NOT completed
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('status')
      .eq('id', tournamentId)
      .single();
    expect(tournament?.status).toBe('in_progress');

    // Verify GF Reset match exists with both players and a real match
    state = await getTournamentState(supabase, tournamentId);
    const gfReset = state.filter((m) => m.bracket === 'grand_final' && m.round === 2);
    expect(gfReset[0].player1_id).toBeTruthy();
    expect(gfReset[0].player2_id).toBeTruthy();
    expect(gfReset[0].match_id).toBeTruthy();

    // GF Reset: WB champ wins
    await completeTournamentMatchViaApi(supabase, gfReset[0].id, wbChamp);

    // Navigate and verify completed
    await page.goto(`/tournament/${tournamentId}`);
    await expect(page.getByText('Completed')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Tournament Winner')).toBeVisible();
    await expect(page.locator('.font-extrabold')).toHaveText(playerName(wbChamp));

    // Standings: 1st and 2nd
    await expect(page.getByText('1st')).toBeVisible();
    await expect(page.getByText('2nd')).toBeVisible();
  });

  test('full 4-player tournament — GF Reset, LB champ wins reset', async ({
    page,
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament();
    const { lbChamp } = await completeToGrandFinal(supabase, tournamentId);

    // GF Match 1: LB champ wins → triggers reset
    let state = await getTournamentState(supabase, tournamentId);
    const gf1 = state.filter((m) => m.bracket === 'grand_final' && m.round === 1);
    await completeTournamentMatchViaApi(supabase, gf1[0].id, lbChamp);

    // GF Reset: LB champ wins
    state = await getTournamentState(supabase, tournamentId);
    const gfReset = state.filter((m) => m.bracket === 'grand_final' && m.round === 2);
    await completeTournamentMatchViaApi(supabase, gfReset[0].id, lbChamp);

    // Navigate and verify LB champ is the tournament winner
    await page.goto(`/tournament/${tournamentId}`);
    await expect(page.getByText('Completed')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Tournament Winner')).toBeVisible();
    await expect(page.locator('.font-extrabold')).toHaveText(playerName(lbChamp));

    // WB champ should be 2nd
    await expect(page.getByText('1st')).toBeVisible();
    await expect(page.getByText('2nd')).toBeVisible();
  });

  test('tournament appears on Games page', async ({ page, createTournament }) => {
    const { tournamentId } = await createTournament({ name: 'E2E Games Page Tournament' });

    await page.goto('/games');

    // Verify tournament section
    await expect(page.getByText('Tournaments')).toBeVisible({ timeout: 15000 });

    // Verify tournament card with name and Live badge
    const tournamentCard = page.locator('a').filter({ hasText: 'E2E Games Page Tournament' });
    await expect(tournamentCard).toBeVisible();
    await expect(tournamentCard.getByText('Live', { exact: true })).toBeVisible();

    // Click tournament card → navigate to tournament page
    await page.getByText('E2E Games Page Tournament').click();
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}`), { timeout: 15000 });
  });

  test('3-player tournament with bye handling', async ({
    page,
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament({
      playerIds: [TEST_PLAYERS.ONE, TEST_PLAYERS.TWO, TEST_PLAYERS.THREE],
    });

    await page.goto(`/tournament/${tournamentId}`);

    // Verify one WB R1 match shows "BYE"
    await expect(page.getByText('BYE')).toBeVisible({ timeout: 15000 });

    // Verify at least 1 LIVE match (the non-bye WB R1 match)
    await expect(page.getByText('LIVE').first()).toBeVisible();

    // Query state to verify bracket structure
    const state = await getTournamentState(supabase, tournamentId);

    const wbR1 = state.filter((m) => m.bracket === 'winners' && m.round === 1);
    expect(wbR1.length).toBe(2);

    const byeMatch = wbR1.find((m) => m.is_bye);
    const realMatch = wbR1.find((m) => !m.is_bye);
    expect(byeMatch).toBeTruthy();
    expect(realMatch).toBeTruthy();
    expect(realMatch!.match_id).toBeTruthy();

    // The bye winner should already be placed in WB R2
    const wbR2 = state.filter((m) => m.bracket === 'winners' && m.round === 2);
    expect(wbR2.length).toBe(1);
    const wbR2HasPlayer = wbR2[0].player1_id || wbR2[0].player2_id;
    expect(wbR2HasPlayer).toBeTruthy();

    // Complete the non-bye WB R1 match
    await completeTournamentMatchViaApi(supabase, realMatch!.id, realMatch!.player1_id!);

    // Verify winner goes to WB R2 (both players now present → match created)
    const state2 = await getTournamentState(supabase, tournamentId);
    const wbR2Updated = state2.filter((m) => m.bracket === 'winners' && m.round === 2);
    expect(wbR2Updated[0].player1_id).toBeTruthy();
    expect(wbR2Updated[0].player2_id).toBeTruthy();
    expect(wbR2Updated[0].match_id).toBeTruthy();

    // LB R1: the single player (from WB R1 bye loser drop) is auto-advanced as a bye
    const lbR1 = state2.filter((m) => m.bracket === 'losers' && m.round === 1);
    if (lbR1.length > 0) {
      expect(lbR1[0].winner_id).toBeTruthy();
      expect(lbR1[0].is_bye).toBe(true);
    }

    // Navigate back and verify updated bracket
    await page.goto(`/tournament/${tournamentId}`);
    await expect(page.getByText('Winners Bracket')).toBeVisible({ timeout: 15000 });
  });

  test('API advancement leaves slot unlinked when match setup fails', async ({
    supabase,
    createTournament,
  }) => {
    const { tournamentId } = await createTournament();

    let state = await getTournamentState(supabase, tournamentId);
    const wbR1 = state
      .filter((m) => m.bracket === 'winners' && m.round === 1 && !m.is_bye)
      .sort((a, b) => a.position - b.position);
    expect(wbR1).toHaveLength(2);

    // Complete WB R1 match 0 so WB R2 exists with one occupied slot.
    await completeTournamentMatchViaApi(supabase, wbR1[0].id, wbR1[0].player1_id!);

    state = await getTournamentState(supabase, tournamentId);
    const wbR2 = state.find((m) => m.bracket === 'winners' && m.round === 2);
    expect(wbR2).toBeTruthy();

    // Force a duplicate-player destination so createMatchForSlot attempts
    // to insert duplicate match_players rows (same player twice), which fails.
    const forcedWinner = wbR1[1].player1_id!;
    const { error: tamperErr } = await supabase
      .from('tournament_matches')
      .update({
        player1_id: forcedWinner,
        player2_id: null,
        winner_id: null,
        loser_id: null,
        match_id: null,
        is_bye: false,
      })
      .eq('id', wbR2!.id);
    expect(tamperErr).toBeNull();

    // Complete WB R1 match 1 via API; advancement should NOT link WB R2 match_id.
    await completeTournamentMatchViaApi(supabase, wbR1[1].id, forcedWinner);

    const { data: destAfter, error: destErr } = await supabase
      .from('tournament_matches')
      .select('id, player1_id, player2_id, match_id')
      .eq('id', wbR2!.id)
      .single();
    expect(destErr).toBeNull();
    expect(destAfter?.player1_id).toBe(forcedWinner);
    expect(destAfter?.player2_id).toBe(forcedWinner);
    expect(destAfter?.match_id).toBeNull();

    // No orphan/linked match should remain for the destination slot.
    const { data: linkedMatches, error: linkedErr } = await supabase
      .from('matches')
      .select('id')
      .eq('tournament_match_id', wbR2!.id);
    expect(linkedErr).toBeNull();
    expect(linkedMatches ?? []).toHaveLength(0);
  });
});
