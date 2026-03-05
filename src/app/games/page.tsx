"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Eye, Trophy, Clock, Users, Swords } from 'lucide-react';
import Link from 'next/link';

type MatchWithDetails = {
  id: string;
  mode: string;
  start_score: string;
  finish: string;
  legs_to_win: number;
  created_at: string;
  winner_player_id: string | null;
  ended_early?: boolean;
  players: Array<{
    id: string;
    display_name: string;
    play_order: number;
  }>;
  legs: Array<{
    id: string;
    winner_player_id: string | null;
  }>;
  winner_name?: string;
};

type TournamentSummary = {
  id: string;
  name: string;
  status: string;
  start_score: string;
  finish: string;
  legs_to_win: number;
  created_at: string;
  player_count: number;
};

export default function GamesPage() {
  const [liveGames, setLiveGames] = useState<MatchWithDetails[]>([]);
  const [recentGames, setRecentGames] = useState<MatchWithDetails[]>([]);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadGames();
    loadTournaments();
  }, []);

  const loadGames = async () => {
    try {
      setLoading(true);
      const supabase = await getSupabaseClient();
      
      // Get matches with players and legs (exclude ended early games)
      const { data: matches } = await supabase
        .from('matches')
        .select(`
          id,
          mode,
          start_score,
          finish,
          legs_to_win,
          created_at,
          winner_player_id,
          ended_early,
          match_players!inner (
            play_order,
            players!inner (
              id,
              display_name
            )
          ),
          legs (
            id,
            winner_player_id
          )
        `)
        .eq('ended_early', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!matches) return;

      // Transform the data
      const transformedMatches = matches.map((match) => ({
        ...match,
        players: (match as unknown as {
          match_players: Array<{
            play_order: number;
            players: { id: string; display_name: string };
          }>
        }).match_players.map((mp) => ({
          id: mp.players.id,
          display_name: mp.players.display_name,
          play_order: mp.play_order
        })).sort((a, b) => a.play_order - b.play_order)
      }));

      // Add winner names
      const matchesWithWinners = transformedMatches.map((match) => {
        if (match.winner_player_id) {
          const winner = match.players.find(p => p.id === match.winner_player_id);
          return {
            ...match,
            winner_name: winner?.display_name || 'Unknown'
          };
        }
        return match;
      });

      // Separate live and completed games
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const live = matchesWithWinners.filter(match => 
        !match.winner_player_id && new Date(match.created_at) > oneDayAgo
      );

      const recent = matchesWithWinners
        .filter(match => match.winner_player_id)
        .slice(0, 10);

      setLiveGames(live);
      setRecentGames(recent);
    } catch (error) {
      console.error('Error loading games:', error);
      setLiveGames([]);
      setRecentGames([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTournaments = async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, status, start_score, finish, legs_to_win, created_at')
        .in('status', ['in_progress', 'completed'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (!data) return;

      // Get player counts
      const tourIds = data.map((t) => t.id);
      const { data: playerCounts } = await supabase
        .from('tournament_players')
        .select('tournament_id')
        .in('tournament_id', tourIds);

      const countMap = new Map<string, number>();
      for (const row of playerCounts ?? []) {
        countMap.set(row.tournament_id, (countMap.get(row.tournament_id) ?? 0) + 1);
      }

      setTournaments(
        data.map((t) => ({
          ...t,
          player_count: countMap.get(t.id) ?? 0,
        }))
      );
    } catch {
      setTournaments([]);
    }
  };

  const handleJoinLiveGame = (matchId: string) => {
    router.push(`/match/${matchId}?spectator=true`);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const gameTime = new Date(dateString);
    const diffMs = now.getTime() - gameTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const getGameDuration = (match: MatchWithDetails) => {
    const legsPlayed = match.legs.length;
    const totalLegs = match.legs_to_win * 2 - 1; // Assuming best of format
    return `${legsPlayed}/${totalLegs} legs`;
  };

  const getGameProgress = (match: MatchWithDetails) => {
    if (match.winner_player_id) return 'Completed';
    
    const legsPlayed = match.legs.length;
    if (legsPlayed === 0) return 'Starting';
    
    return 'In Progress';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading games...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Games</h1>
        <p className="text-muted-foreground">Live and recent dart matches</p>
      </div>

      {/* Active Tournaments */}
      {tournaments.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-purple-500" />
            <h2 className="text-2xl font-semibold">Tournaments</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/tournament/${t.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{t.name}</CardTitle>
                      <Badge variant={t.status === 'in_progress' ? 'default' : 'secondary'} className={t.status === 'in_progress' ? 'animate-pulse' : ''}>
                        {t.status === 'in_progress' ? 'Live' : 'Done'}
                      </Badge>
                    </div>
                    <CardDescription>
                      {t.start_score} X01 &middot; {t.finish === 'double_out' ? 'Double Out' : 'Single Out'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{t.player_count} players</span>
                      <span>&middot;</span>
                      <Clock className="h-4 w-4" />
                      <span>{formatTimeAgo(t.created_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Live Games Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Play className="h-5 w-5 text-red-500" />
          <h2 className="text-2xl font-semibold">Live Games</h2>
          {liveGames.length > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {liveGames.length} Live
            </Badge>
          )}
        </div>

        {liveGames.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No live games at the moment
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {liveGames.map((match) => (
              <Card key={match.id} className="hover:shadow-md transition-shadow border-red-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {match.start_score} {match.mode.toUpperCase()}
                    </CardTitle>
                    <Badge variant="destructive" className="animate-pulse">
                      LIVE
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Started {formatTimeAgo(match.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4" />
                      <span className="font-medium">Players</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {match.players.map((player) => (
                        <Badge key={player.id} variant="outline" className="text-xs">
                          {player.display_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{getGameDuration(match)}</span>
                    <span>{getGameProgress(match)}</span>
                  </div>

                  <Button 
                    onClick={() => handleJoinLiveGame(match.id)}
                    className="w-full"
                    size="sm"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Watch Live
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent Games Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <h2 className="text-2xl font-semibold">Recent Games</h2>
        </div>

        {recentGames.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No completed games yet
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {recentGames.map((match) => (
              <Card key={match.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    {/* Game Info */}
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {match.start_score} {match.mode.toUpperCase()}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(match.created_at)}
                      </div>
                    </div>

                    {/* Players */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Players</div>
                      <div className="flex flex-wrap gap-1">
                        {match.players.map((player) => (
                          <Badge 
                            key={player.id} 
                            variant={player.id === match.winner_player_id ? "default" : "outline"}
                            className="text-xs"
                          >
                            {player.display_name}
                            {player.id === match.winner_player_id && ' 🏆'}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Winner */}
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">Winner</div>
                      <div className="font-semibold text-green-700 flex items-center gap-1">
                        <Trophy className="h-4 w-4" />
                        {match.winner_name}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">Game Stats</div>
                      <div className="text-sm">
                        <div>{getGameDuration(match)}</div>
                        <div className="text-muted-foreground">Best of {match.legs_to_win * 2 - 1}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}