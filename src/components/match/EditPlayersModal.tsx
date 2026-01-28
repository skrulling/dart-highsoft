"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Player } from '@/lib/match/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  canEditPlayers: boolean;
  canReorderPlayers: boolean;
  players: Player[];
  availablePlayers: Player[];
  newPlayerName: string;
  onNewPlayerNameChange: (value: string) => void;
  onAddNewPlayer: () => void | Promise<void>;
  onAddExistingPlayer: (playerId: string) => void | Promise<void>;
  onRemovePlayer: (playerId: string) => void | Promise<void>;
  onMovePlayerUp: (index: number) => void | Promise<void>;
  onMovePlayerDown: (index: number) => void | Promise<void>;
};

export function EditPlayersModal({
  open,
  onClose,
  canEditPlayers,
  canReorderPlayers,
  players,
  availablePlayers,
  newPlayerName,
  onNewPlayerNameChange,
  onAddNewPlayer,
  onAddExistingPlayer,
  onRemovePlayer,
  onMovePlayerUp,
  onMovePlayerDown,
}: Props) {
  if (!open) return null;

  const addablePlayers = availablePlayers.filter((player) => !players.some((p) => p.id === player.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-[600px] max-h-[90vh] overflow-auto rounded-lg border bg-background p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Edit Players</div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {canEditPlayers
              ? 'You can add or remove players before the first round is completed.'
              : 'Players cannot be edited after the first round is completed.'}
          </div>

          <div>
            <div className="font-medium mb-2">
              Current Players ({players.length})
              {canReorderPlayers && <span className="ml-2 text-xs text-muted-foreground">(reorder enabled)</span>}
            </div>
            <div className="space-y-2 max-h-48 overflow-auto border rounded p-2">
              {players.map((player, index) => (
                <div key={player.id} className="flex items-center gap-2 py-2 px-3 bg-accent/30 rounded">
                  {canReorderPlayers && (
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMovePlayerUp(index)}
                        disabled={index === 0}
                        className="h-5 w-6 p-0"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMovePlayerDown(index)}
                        disabled={index === players.length - 1}
                        className="h-5 w-6 p-0"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-muted-foreground">#{index + 1}</span>
                    <span className="truncate">{player.display_name}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRemovePlayer(player.id)}
                    disabled={players.length <= 2}
                    className="shrink-0 min-w-[70px]"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="font-medium mb-2">Add New Player</div>
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={newPlayerName}
                onChange={(e) => onNewPlayerNameChange(e.target.value)}
              />
              <Button
                onClick={() => {
                  void onAddNewPlayer();
                }}
                disabled={!newPlayerName.trim()}
              >
                Add New
              </Button>
            </div>
          </div>

          <div>
            <div className="font-medium mb-2">Add Existing Player</div>
            <div className="space-y-2 max-h-48 overflow-auto border rounded p-2">
              {addablePlayers.map((player) => (
                <div key={player.id} className="flex items-center gap-2 py-2 px-3 hover:bg-accent/30 rounded">
                  <span className="flex-1 min-w-0 truncate">{player.display_name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void onAddExistingPlayer(player.id);
                    }}
                    className="shrink-0 min-w-[50px]"
                  >
                    Add
                  </Button>
                </div>
              ))}
              {addablePlayers.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">No additional players available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

