"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

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
  const [legsToWin, setLegsToWin] = useState(3);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('players').select('*').order('display_name');
      setPlayers((data as Player[]) ?? []);
    })();
  }, []);

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;
    const supabase = getSupabaseClient();
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

    const supabase = getSupabaseClient();
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
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">New Match</h1>
      <div className="space-y-3">
        <div className="font-medium">Players</div>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => (
            <label key={p.id} className={`flex items-center gap-2 border p-2 rounded ${selectedIds.includes(p.id) ? 'bg-blue-50 border-blue-300' : ''}`}>
              <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <span>{p.display_name}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input input-bordered flex-1 border rounded px-3 py-2"
            placeholder="New player name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn bg-green-600 text-white px-3 py-2 rounded" onClick={createPlayer}>
            Add player
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-medium mb-1">Start score</div>
          <select
            className="border rounded px-3 py-2 w-full"
            value={startScore}
            onChange={(e) => setStartScore(e.target.value as StartScore)}
          >
            <option value="201">201</option>
            <option value="301">301</option>
            <option value="501">501</option>
          </select>
        </div>
        <div>
          <div className="font-medium mb-1">Finish rule</div>
          <select className="border rounded px-3 py-2 w-full" value={finish} onChange={(e) => setFinish(e.target.value as FinishRule)}>
            <option value="double_out">Double out</option>
            <option value="single_out">Single out</option>
          </select>
        </div>
        <div>
          <div className="font-medium mb-1">Legs to win</div>
          <input
            type="number"
            min={1}
            className="border rounded px-3 py-2 w-full"
            value={legsToWin}
            onChange={(e) => setLegsToWin(parseInt(e.target.value || '1', 10))}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn bg-blue-600 text-white px-4 py-2 rounded" onClick={onStart}>
          Start match
        </button>
      </div>
    </div>
  );
}
