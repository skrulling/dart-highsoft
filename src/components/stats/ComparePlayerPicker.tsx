"use client";

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPlayerColor } from '@/lib/stats/playerColors';
import type { PlayerRow } from '@/lib/stats/types';

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 6;

interface ComparePlayerPickerProps {
  players: PlayerRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ComparePlayerPicker({ players, selectedIds, onChange }: ComparePlayerPickerProps) {
  const playerById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const available = useMemo(
    () => players.filter(p => !selectedIds.includes(p.id)),
    [players, selectedIds]
  );

  const atMax = selectedIds.length >= MAX_COMPARE;

  const handleAdd = (id: string) => {
    if (!id) return;
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= MAX_COMPARE) return;
    onChange([...selectedIds, id]);
  };

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter(x => x !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.map((id, i) => {
          const player = playerById.get(id);
          if (!player) return null;
          return (
            <Badge
              key={id}
              variant="outline"
              className="text-sm px-3 py-1 gap-2 border-2"
              style={{ borderColor: getPlayerColor(i) }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: getPlayerColor(i) }}
              />
              {player.display_name}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-1 hover:bg-muted"
                onClick={() => handleRemove(id)}
                aria-label={`Remove ${player.display_name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          );
        })}

        {!atMax && available.length > 0 && (
          <Select value="" onValueChange={handleAdd}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="+ Add player" />
            </SelectTrigger>
            <SelectContent>
              {available.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selectedIds.length < MIN_COMPARE
          ? `Pick at least ${MIN_COMPARE} players to compare.`
          : atMax
            ? `Maximum ${MAX_COMPARE} players.`
            : `Add up to ${MAX_COMPARE - selectedIds.length} more.`}
      </p>
    </div>
  );
}
