"use client";

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Player = { id: string; display_name: string };

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const supabase = getSupabaseClient();
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
    const supabase = getSupabaseClient();
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
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Players</h1>
      <form onSubmit={addPlayer} className="flex gap-2">
        <Input className="flex-1" placeholder="New player name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={loading}>Add</Button>
      </form>
      <ul className="divide-y border rounded bg-card text-card-foreground">
        {players.map((p) => (
          <li key={p.id} className="px-3 py-2 flex items-center justify-between">
            <span>{p.display_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
