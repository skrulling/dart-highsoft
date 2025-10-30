"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Player = { id: string; display_name: string };

type StartScore = '201' | '301' | '501';

type FinishRule = 'single_out' | 'double_out';

export default function NewMatchPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [startScore, setStartScore] = useState<StartScore>('501');
  const [finish, setFinish] = useState<FinishRule>('double_out');
  const [legsToWin, setLegsToWin] = useState(1);

  useEffect(() => {
    (async () => {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.from('players').select('*').order('display_name');
      setPlayers((data as Player[]) ?? []);
    })();
  }, []);

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('players').insert({ display_name: name }).select('*').single();
    if (error) return alert(error.message);
    setPlayers((prev) => [...prev, data as Player]);
    setSelectedIds((prev) => [...prev, (data as Player).id]);
    setNewName('');
  }

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onStart() {
    if (selectedIds.length < 2) return alert('Select at least 2 players');
    const order = [...selectedIds].sort(() => Math.random() - 0.5);

    const supabase = await getSupabaseClient();
    const { data: match, error: mErr } = await supabase
      .from('matches')
      .insert({ mode: 'x01', start_score: startScore, finish, legs_to_win: legsToWin })
      .select('*')
      .single();
    if (mErr || !match) return alert(mErr?.message ?? 'Failed to create match');

    const matchId = (match as { id: string }).id;
    const mp = order.map((id, idx) => ({ match_id: matchId, player_id: id, play_order: idx }));
    const { error: mpErr } = await supabase.from('match_players').insert(mp);
    if (mpErr) return alert(mpErr.message);

    const { error: lErr } = await supabase
      .from('legs')
      .insert({ match_id: matchId, leg_number: 1, starting_player_id: order[0] });
    if (lErr) return alert(lErr.message);

    router.push(`/match/${matchId}`);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">New Match</h1>
      <div className="space-y-3">
        <div className="font-medium">Players</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => (
            <label key={p.id} className={`flex items-center gap-2 border p-2 rounded ${selectedIds.includes(p.id) ? 'border-accent bg-accent/30' : ''}`}>
              <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <span>{p.display_name}</span>
            </label>
          ))}
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
            <Button type="button" variant="outline" onClick={() => setLegsToWin((v) => Math.max(1, v - 1))}>
              −
            </Button>
            <Input readOnly className="text-center select-none" value={String(legsToWin)} />
            <Button type="button" variant="outline" onClick={() => setLegsToWin((v) => v + 1)}>
              +
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onStart}>Start match</Button>
      </div>
    </div>
  );
}
