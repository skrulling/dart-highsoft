"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AroundWorldSession,
  AroundWorldVariant,
  createAroundWorldSession,
  completeAroundWorldSession,
  getActiveAroundWorldSession,
  cancelAroundWorldSession,
  formatDuration,
} from '@/utils/aroundTheWorld';
import { AroundTheWorldResults } from '@/components/AroundTheWorldResults';

type Player = { id: string; display_name: string };

type Props = {
  player: Player;
  onBack: () => void;
};

export default function AroundTheWorldGame({ player, onBack }: Props) {
  const [session, setSession] = useState<AroundWorldSession | null>(null);
  const [variant, setVariant] = useState<AroundWorldVariant>('single');
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedSession, setCompletedSession] = useState<AroundWorldSession | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && session) {
      const startTime = new Date(session.started_at).getTime();
      
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setElapsedSeconds(elapsed);
      }, 100); // Update every 100ms for smooth timer
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRunning, session]);

  // Load any active session on component mount
  useEffect(() => {
    const loadActiveSession = async () => {
      try {
        const activeSession = await getActiveAroundWorldSession(player.id);
        if (activeSession) {
          setSession(activeSession);
          setVariant(activeSession.variant);
          setIsRunning(true);
          
          // Calculate elapsed time since session started
          const startTime = new Date(activeSession.started_at).getTime();
          const now = Date.now();
          const elapsed = Math.floor((now - startTime) / 1000);
          setElapsedSeconds(elapsed);
        }
      } catch (error) {
        console.error('Error loading active session:', error);
      }
    };

    loadActiveSession();
  }, [player.id]);

  const startSession = async () => {
    try {
      const newSession = await createAroundWorldSession(player.id, variant);
      setSession(newSession);
      setIsRunning(true);
      setElapsedSeconds(0);
    } catch (error) {
      console.error('Error starting session:', error);
      alert('Failed to start session. Please try again.');
    }
  };

  const finishSession = async () => {
    if (!session) return;

    try {
      const completed = await completeAroundWorldSession(session.id);
      setSession(null);
      setIsRunning(false);
      setCompletedSession(completed);
      setShowResults(true);
      setElapsedSeconds(0);
    } catch (error) {
      console.error('Error completing session:', error);
      alert('Failed to complete session. Please try again.');
    }
  };

  const cancelSession = async () => {
    if (!session) return;

    try {
      await cancelAroundWorldSession(session.id);
      setSession(null);
      setIsRunning(false);
      setElapsedSeconds(0);
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert('Failed to cancel session. Please try again.');
    }
  };

  const handleResultsClose = useCallback(() => {
    setShowResults(false);
    setCompletedSession(null);
  }, []);

  if (showResults && completedSession) {
    return (
      <AroundTheWorldResults
        player={player}
        session={completedSession}
        onClose={handleResultsClose}
        onPlayAgain={() => {
          handleResultsClose();
          setVariant(completedSession.variant);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <Button variant="outline" onClick={onBack} className="mb-4">
          ← Back to Practice Menu
        </Button>
        <h1 className="text-3xl font-bold">Around the World</h1>
        <p className="text-muted-foreground mt-2">
          Hit numbers 1-20 in sequence as fast as possible!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span>🎯</span>
            {player.display_name}'s Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!session && (
            <>
              <div>
                <h3 className="font-semibold mb-3">Choose Variant</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    variant={variant === 'single' ? 'default' : 'outline'}
                    onClick={() => setVariant('single')}
                    className="p-4 h-auto flex flex-col items-center gap-2"
                  >
                    <div className="text-lg font-bold">Single</div>
                    <div className="text-sm text-center">
                      Hit anywhere in the number segment
                    </div>
                  </Button>
                  <Button
                    variant={variant === 'double' ? 'default' : 'outline'}
                    onClick={() => setVariant('double')}
                    className="p-4 h-auto flex flex-col items-center gap-2"
                  >
                    <div className="text-lg font-bold">Double</div>
                    <div className="text-sm text-center">
                      Must hit the double ring only
                    </div>
                  </Button>
                </div>
              </div>

              <div className="text-center">
                <Button size="lg" onClick={startSession}>
                  Start Timer
                </Button>
              </div>
            </>
          )}

          {session && isRunning && (
            <div className="text-center space-y-6">
              <div>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  {variant === 'single' ? 'Single' : 'Double'} Mode
                </Badge>
              </div>

              <div className="text-6xl md:text-8xl font-mono font-bold text-primary">
                {formatDuration(elapsedSeconds)}
              </div>

              <div className="space-y-4">
                <div className="text-lg text-muted-foreground">
                  Hit numbers 1-20 in sequence...
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    size="lg" 
                    onClick={finishSession}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    ✓ Done!
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg" 
                    onClick={cancelSession}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!session && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How to Play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge variant="secondary">1</Badge>
              <div>
                <div className="font-semibold">Choose your variant</div>
                <div className="text-sm text-muted-foreground">
                  Single: Hit anywhere on numbers 1-20<br />
                  Double: Hit only the double ring of numbers 1-20
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary">2</Badge>
              <div>
                <div className="font-semibold">Start the timer</div>
                <div className="text-sm text-muted-foreground">
                  Timer begins counting immediately
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary">3</Badge>
              <div>
                <div className="font-semibold">Hit 1-20 in sequence</div>
                <div className="text-sm text-muted-foreground">
                  Go as fast as you can while maintaining accuracy
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary">4</Badge>
              <div>
                <div className="font-semibold">Click "Done" when finished</div>
                <div className="text-sm text-muted-foreground">
                  Your time will be saved and compared to previous attempts
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}