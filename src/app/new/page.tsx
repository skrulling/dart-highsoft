"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { apiRequest } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCATIONS, type LocationValue } from '@/utils/locations';

type Player = { id: string; display_name: string; location: string | null };

type StartScore = '201' | '301' | '501';

type FinishRule = 'single_out' | 'double_out';

const STORAGE_KEY = 'match-location-filter';

function loadEnabledLocations(): LocationValue[] {
  if (typeof window === 'undefined') return LOCATIONS.map((l) => l.value);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LocationValue[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return LOCATIONS.map((l) => l.value);
}

export default function NewMatchPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [startScore, setStartScore] = useState<StartScore>('501');
  const [finish, setFinish] = useState<FinishRule>('double_out');
  const [legsToWin, setLegsToWin] = useState(1);
  const [fairEnding, setFairEnding] = useState(false);
  const [enabledLocations, setEnabledLocations] = useState<LocationValue[]>(loadEnabledLocations);

  useEffect(() => {
    (async () => {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.from('players').select('*').eq('is_active', true).order('display_name');
      setPlayers((data as Player[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledLocations));
  }, [enabledLocations]);

  function toggleLocation(loc: LocationValue) {
    setEnabledLocations((prev) => {
      const next = prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc];
      // Deselect players that will be hidden by the new filter
      const hiddenIds = new Set(
        players
          .filter((p) => p.location !== null && !next.includes(p.location as LocationValue))
          .map((p) => p.id)
      );
      if (hiddenIds.size > 0) {
        setSelectedIds((ids) => ids.filter((id) => !hiddenIds.has(id)));
      }
      return next;
    });
  }

  const filteredPlayers = players.filter(
    (p) => p.location === null || enabledLocations.includes(p.location as LocationValue)
  );

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;
    try {
      const result = await apiRequest<{ player: Player }>('/api/players', { body: { displayName: name } });
      setPlayers((prev) => [...prev, result.player]);
      setSelectedIds((prev) => [...prev, result.player.id]);
      setNewName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create player';
      alert(message);
    }
  }

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onStart() {
    if (selectedIds.length < 2) return alert('Select at least 2 players');
    try {
      const result = await apiRequest<{ matchId: string }>('/api/matches', {
        body: {
          startScore: parseInt(startScore, 10),
          finishRule: finish,
          legsToWin,
          fairEnding: legsToWin === 1 ? fairEnding : false,
          playerIds: selectedIds,
        },
      });
      router.push(`/match/${result.matchId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create match';
      alert(message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">New Match</h1>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Players</div>
          <div className="flex gap-1">
            {LOCATIONS.map((loc) => (
              <Button
                key={loc.value}
                type="button"
                size="sm"
                variant={enabledLocations.includes(loc.value) ? 'default' : 'outline'}
                onClick={() => toggleLocation(loc.value)}
              >
                {loc.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredPlayers.map((p) => {
            const loc = LOCATIONS.find((l) => l.value === p.location);
            return (
              <label key={p.id} className={`flex items-center gap-2 border p-2 rounded ${selectedIds.includes(p.id) ? 'border-accent bg-accent/30' : ''}`}>
                <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.display_name}</span>
                {loc && <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{loc.label}</span>}
              </label>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="New player name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={createPlayer}>
            Add player
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-medium mb-1">Start score</div>
          <Select value={startScore} onValueChange={(v) => setStartScore(v as StartScore)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Start score" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="201">201</SelectItem>
              <SelectItem value="301">301</SelectItem>
              <SelectItem value="501">501</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="font-medium mb-1">Finish rule</div>
          <Select value={finish} onValueChange={(v) => setFinish(v as FinishRule)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Finish rule" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="double_out">Double out</SelectItem>
              <SelectItem value="single_out">Single out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="font-medium mb-1">Legs to win</div>
          <div className="flex items-stretch gap-2">
            <Button type="button" variant="outline" onClick={() => {
              setLegsToWin((v) => {
                const next = Math.max(1, v - 1);
                if (next !== 1) setFairEnding(false);
                return next;
              });
            }}>
              −
            </Button>
            <Input readOnly className="text-center select-none" value={String(legsToWin)} />
            <Button type="button" variant="outline" onClick={() => {
              setLegsToWin((v) => {
                const next = v + 1;
                if (next !== 1) setFairEnding(false);
                return next;
              });
            }}>
              +
            </Button>
          </div>
        </div>
      </div>

      {legsToWin === 1 && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={fairEnding} onChange={(e) => setFairEnding(e.target.checked)} />
          <span className="text-sm">Fair ending — all players complete the round before a winner is declared</span>
        </label>
      )}

      <div className="flex gap-3">
        <Button onClick={onStart}>Start match</Button>
      </div>
    </div>
  );
}
