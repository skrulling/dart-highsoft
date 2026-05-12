import type { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function cleanupTournament(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tournamentId: string
) {
  const { data: tournamentMatches } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tournamentId);

  const tournamentMatchIds = (tournamentMatches ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');

  if (tournamentMatchIds.length > 0) {
    // Remove linked matches first so matches.tournament_match_id doesn't block tournament cleanup.
    // Cascades to legs, turns, throws, match_players, elo_ratings, elo_ratings_multi.
    await supabase.from('matches').delete().in('tournament_match_id', tournamentMatchIds);
  }

  // Nullify self-referential FKs on tournament_matches before cascade delete
  await supabase
    .from('tournament_matches')
    .update({ next_winner_tm_id: null, next_loser_tm_id: null })
    .eq('tournament_id', tournamentId);

  // Deleting the tournament cascades to tournament_matches and tournament_players
  await supabase.from('tournaments').delete().eq('id', tournamentId);
}
