"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Player = { id: string; display_name: string };

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await supabase.from('players').select('*').order('display_name');
    setPlayers(data ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('players').insert({ display_name: name.trim() });
    setLoading(false);
    if (!error) {
      setName('');
      load();
    } else {
      alert(error.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Players</h1>
      <form onSubmit={addPlayer} className="flex gap-2">
        <input
          className="input input-bordered flex-1 border rounded px-3 py-2"
          placeholder="New player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
          Add
        </button>
      </form>
      <ul className="divide-y border rounded">
        {players.map((p) => (
          <li key={p.id} className="px-3 py-2 flex items-center justify-between">
            <span>{p.display_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
