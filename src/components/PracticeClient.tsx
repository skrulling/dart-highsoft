"use client";

import Dartboard from '@/components/Dartboard';
import MobileKeypad from '@/components/MobileKeypad';
import PracticeTrendChart from '@/components/PracticeTrendChart';
import { SegmentResult } from '@/utils/dartboard';
import { 
  createPracticeSession, 
  getActivePracticeSession, 
  endPracticeSession,
  addPracticeThrow,
  getPracticeSessionTurns,
  getPracticeSessionStats,
  getPlayerPracticeHistory,
  getPlayerOverallPracticeStats,
  PracticeSession,
  PracticeTurn,
  PracticeSessionStats,
} from '@/utils/practiceSession';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AroundTheWorldGame from '@/components/AroundTheWorldGame';

type Player = { id: string; display_name: string };

type Props = {
  player: Player;
};

type GameMode = 'menu' | 'traditional' | 'around-the-world';

export default function PracticeClient({ player }: Props) {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [turns, setTurns] = useState<PracticeTurn[]>([]);
  const [, setCurrentTurn] = useState<PracticeTurn | null>(null);
  const [dartIndex, setDartIndex] = useState(1);
  const [totalThrows, setTotalThrows] = useState(0);
  const [sessionStats, setSessionStats] = useState<PracticeSessionStats | null>(null);
  const [, setPracticeHistory] = useState<PracticeSessionStats[]>([]);
  const [overallStats, setOverallStats] = useState<{ overall_avg_score?: number; total_sessions: number; total_practice_turns: number; total_tons: number } | null>(null);
  const [matchAverage, setMatchAverage] = useState<number | null>(null);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionGoal, setSessionGoal] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const ongoingTurnRef = useRef<PracticeTurn | null>(null);

  const loadSessionData = useCallback(async () => {
    if (!session) return;
    
    const [turnsData, statsData] = await Promise.all([
      getPracticeSessionTurns(session.id),
      getPracticeSessionStats(session.id)
    ]);
    
    setTurns(turnsData);
    setSessionStats(statsData);
    
    // Calculate total throws and current dart position
    const lastTurn = turnsData[turnsData.length - 1];
    if (lastTurn) {
      if (!lastTurn.finished) {
        // Turn is ongoing, get throw count
        const throwCount = await getThrowCount(lastTurn.id);
        setCurrentTurn(lastTurn);
        setDartIndex(throwCount + 1);
        ongoingTurnRef.current = lastTurn;
        setTotalThrows(statsData?.total_turns ? (statsData.total_turns - 1) * 3 + throwCount : throwCount);
      } else {
        // Last turn is complete, ready for new turn
        setCurrentTurn(null);
        setDartIndex(1);
        ongoingTurnRef.current = null;
        setTotalThrows(statsData?.total_turns ? statsData.total_turns * 3 : 0);
      }
    } else {
      // No turns yet
      setCurrentTurn(null);
      setDartIndex(1);
      ongoingTurnRef.current = null;
      setTotalThrows(0);
    }
  }, [session]);

  const getThrowCount = async (turnId: string): Promise<number> => {
    const supabase = await getSupabaseClient();
    const { count } = await supabase
      .from('practice_throws')
      .select('*', { count: 'exact', head: true })
      .eq('turn_id', turnId);
    return count || 0;
  };

  const loadPlayerData = useCallback(async (playerId: string) => {
    const [history, overall, matchStats] = await Promise.all([
      getPlayerPracticeHistory(playerId, 10),
      getPlayerOverallPracticeStats(playerId),
      getPlayerMatchAverage()
    ]);
    
    setPracticeHistory(history);
    setOverallStats(overall);
    setMatchAverage(matchStats);
  }, []);

  const getPlayerMatchAverage = async (): Promise<number | null> => {
    // This would need to be implemented to get the player's average from regular matches
    // For now, return null or implement based on your existing match data
    return null;
  };

  const startPractice = useCallback(async () => {
    try {
      setIsStarting(true);
      console.log('Starting practice for player:', player.display_name);
      
      // Check for existing active session
      console.log('Checking for existing active session...');
      let activeSession = await getActivePracticeSession(player.id);
      console.log('Existing active session:', activeSession);
      
      if (!activeSession) {
        console.log('Creating new practice session...');
        await createPracticeSession(
          player.id,
          501, // Not used in practice mode, but kept for database compatibility
          'double_out', // Not used in practice mode
          sessionGoal || undefined
        );
        console.log('Getting newly created session...');
        activeSession = await getActivePracticeSession(player.id);
        console.log('New session:', activeSession);
      }
      
      console.log('Setting session state...');
      setSession(activeSession);
      console.log('Loading player data...');
      await loadPlayerData(player.id);
      console.log('Practice session started successfully');
    } catch (error) {
      console.error('Failed to start practice session:', error);
      // Reset state on error
      setSession(null);
    } finally {
      setIsStarting(false);
    }
  }, [player.id, player.display_name, sessionGoal, loadPlayerData]);

  const endSession = async () => {
    if (!session) return;
    
    await endPracticeSession(session.id, sessionNotes);
    setSession(null);
    setTurns([]);
    setCurrentTurn(null);
    setDartIndex(1);
    setTotalThrows(0);
    setSessionStats(null);
    setShowEndDialog(false);
    setSessionNotes('');
    ongoingTurnRef.current = null;
    // Automatically start a new session
    await startPractice();
  };

  // Remove handleNewGame - not needed in practice mode

  const handleThrow = useCallback(async (segment: SegmentResult) => {
    if (!session) return;

    try {
      const result = await addPracticeThrow(session.id, segment, dartIndex);

      if (result.turnCompleted) {
        // Turn completed, ready for new turn
        setCurrentTurn(null);
        setDartIndex(1);
        ongoingTurnRef.current = null;
      } else {
        // Continue current turn
        setCurrentTurn(result.turn);
        setDartIndex(dartIndex + 1);
        ongoingTurnRef.current = result.turn;
      }

      // Update total throws count
      setTotalThrows(prev => prev + 1);
      
      await loadSessionData();
    } catch (error) {
      console.error('Error adding throw:', error);
    }
  }, [session, dartIndex, loadSessionData]);

  const handleDartboardHit = useCallback((x: number, y: number, result: SegmentResult) => {
    handleThrow(result);
  }, [handleThrow]);

  // For practice mode, we'll handle realtime updates differently since
  // useRealtime is designed for matches. For now, we'll skip realtime for practice.

  useEffect(() => {
    if (session) {
      loadSessionData();
    }
  }, [session, loadSessionData]);

  // Check for existing traditional practice session on component mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const existingSession = await getActivePracticeSession(player.id);
      if (existingSession) {
        // Continue existing traditional practice session
        setGameMode('traditional');
        setSession(existingSession);
      }
    };
    
    checkExistingSession();
  }, [player.id]);

  // Calculate trend data for charts
  const trendData = useMemo(() => {
    if (!turns || turns.length === 0) return [];
    
    let runningTotal = 0;
    return turns.map((turn, index) => {
      runningTotal += turn.total_scored;
      return {
        turnNumber: turn.turn_number,
        score: turn.total_scored,
        avg: runningTotal / (index + 1)
      };
    });
  }, [turns]);

  // Handle different game modes
  if (gameMode === 'around-the-world') {
    return (
      <AroundTheWorldGame 
        player={player} 
        onBack={() => setGameMode('menu')}
      />
    );
  }

  if (gameMode === 'menu') {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Practice Mode</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Welcome {player.display_name}! Choose your training game:
        </p>

        <div className="grid gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => {
            setGameMode('traditional');
            startPractice();
          }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="text-2xl">🎯</span>
                Traditional Practice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Classic dart practice with score tracking, averages, and turn-by-turn analysis.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs bg-muted px-2 py-1 rounded">501 game</span>
                <span className="text-xs bg-muted px-2 py-1 rounded">Score tracking</span>
                <span className="text-xs bg-muted px-2 py-1 rounded">Dart statistics</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setGameMode('around-the-world')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="text-2xl">⏱️</span>
                Around the World
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Speed challenge: Hit numbers 1-20 in sequence as fast as possible. Choose single or double mode.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs bg-muted px-2 py-1 rounded">Timer-based</span>
                <span className="text-xs bg-muted px-2 py-1 rounded">Single/Double modes</span>
                <span className="text-xs bg-muted px-2 py-1 rounded">Personal bests</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isStarting || !session) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center space-y-4">
          <Button variant="outline" onClick={() => setGameMode('menu')} className="mb-4">
            ← Back to Practice Menu
          </Button>
          <h1 className="text-2xl font-bold">Traditional Practice</h1>
          <p>Starting practice session for {player.display_name}...</p>
          <p className="text-sm text-muted-foreground">
            If this is taking too long, make sure the database migration has been applied.
          </p>
          <div className="space-y-2">
            <Input
              placeholder="Session Goal (optional)"
              value={sessionGoal}
              onChange={(e) => setSessionGoal(e.target.value)}
              className="max-w-md mx-auto"
            />
            <p className="text-xs text-muted-foreground">
              e.g., &quot;Average 60+ for 10 rounds&quot;, &quot;Hit 5 doubles in a row&quot;
            </p>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="container mx-auto p-3 lg:p-6">
      <Button variant="outline" onClick={() => setGameMode('menu')} className="mb-4">
        ← Back to Practice Menu
      </Button>
      
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Main game area */}
        <div className="flex-1 order-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">Traditional Practice</h1>
              <p className="text-sm text-muted-foreground">{player.display_name}</p>
              {session.session_goal && (
                <p className="text-xs lg:text-sm text-blue-600 mt-1">Goal: {session.session_goal}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowEndDialog(true)}>
              End Session
            </Button>
          </div>

          {/* Practice status */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">Round Average</p>
                  <p className="text-2xl lg:text-4xl font-bold">
                    {sessionStats?.avg_turn_score?.toFixed(1) || '0.0'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Dart</p>
                  <p className="text-xl lg:text-2xl font-bold">{dartIndex}/3</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Turns</p>
                  <p className="text-xl lg:text-2xl font-bold">{turns.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Throws</p>
                  <p className="text-xl lg:text-2xl font-bold">{totalThrows}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Input method - Mobile first */}
          <div className="mb-6">
            <div className="lg:hidden">
              <MobileKeypad onHit={handleThrow} />
            </div>
            <div className="hidden lg:block">
              <Dartboard onHit={handleDartboardHit} />
            </div>
          </div>

          {/* Session stats */}
          {sessionStats && sessionStats.total_turns > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Session Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Max Round</p>
                    <p className="text-xl font-bold">{sessionStats.max_turn_score}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tons (100+)</p>
                    <p className="text-xl font-bold">{sessionStats.tons}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">High Finishes (140+)</p>
                    <p className="text-xl font-bold">{sessionStats.high_finishes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Charts sidebar - Show on mobile at top */}
        <div className="order-0 lg:order-1 lg:w-80">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base lg:text-lg">Session Progress</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PracticeTrendChart
                sessionData={trendData}
                overallAvg={overallStats?.overall_avg_score}
                matchAvg={matchAverage || undefined}
                title=""
                height={180}
              />
            </CardContent>
          </Card>

          {/* Overall stats comparison */}
          {overallStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Overall Practice Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Sessions</span>
                  <span className="font-medium">{overallStats.total_sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Overall Average</span>
                  <span className="font-medium">{overallStats.overall_avg_score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Total Turns</span>
                  <span className="font-medium">{overallStats.total_practice_turns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Total Tons</span>
                  <span className="font-medium">{overallStats.total_tons}</span>
                </div>
                
                {sessionStats && (
                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium mb-2">Session vs Overall</p>
                    <div className="flex justify-between text-sm">
                      <span>Average</span>
                      <span className={
                        sessionStats.avg_turn_score > (overallStats?.overall_avg_score || 0)
                          ? 'text-green-600 font-medium'
                          : 'text-red-600'
                      }>
                        {sessionStats.avg_turn_score > (overallStats?.overall_avg_score || 0) ? '+' : ''}
                        {(sessionStats.avg_turn_score - (overallStats?.overall_avg_score || 0)).toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* End session dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Practice Session</DialogTitle>
            <DialogDescription>
              Add notes about your practice session (optional)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Notes about this session..."
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndDialog(false)}>
              Cancel
            </Button>
            <Button onClick={endSession}>
              End Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
