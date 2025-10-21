"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type LiveMatch = {
  id: string;
  created_at: string;
  start_score: string;
  legs_to_win: number;
  players: Array<{
    id: string;
    display_name: string;
    play_order: number;
  }>;
};

const interactiveTagNames = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return interactiveTagNames.has(target.tagName);
}

function formatTimeAgo(timestamp: string): string {
  const created = new Date(timestamp);
  if (Number.isNaN(created.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function MatchSpectatorHotkey() {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const fetchLiveMatches = useCallback(async (): Promise<LiveMatch[]> => {
    const supabase = await getSupabaseClient();
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
    const oneHourAgoIso = new Date(oneHourAgoMs).toISOString();
    const { data, error } = await supabase
      .from("matches")
      .select(
        `
        id,
        created_at,
        start_score,
        legs_to_win,
        winner_player_id,
        ended_early,
        match_players!inner (
          play_order,
          players!inner (
            id,
            display_name
          )
        )
      `
      )
      .eq("ended_early", false)
      .is("winner_player_id", null)
      .gte("created_at", oneHourAgoIso)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data) {
      console.error("Failed to load live matches", error);
      return [];
    }

    return data
      .filter((match) => new Date(match.created_at).getTime() >= oneHourAgoMs)
      .map((match) => {
        const mapped = match as unknown as {
          id: string;
          created_at: string;
          start_score: string;
          legs_to_win: number;
          match_players: Array<{
            play_order: number;
            players: { id: string; display_name: string };
          }>;
        };

        const players = mapped.match_players
          .map((mp) => ({
            id: mp.players.id,
            display_name: mp.players.display_name,
            play_order: mp.play_order,
          }))
          .sort((a, b) => a.play_order - b.play_order);

        return {
          id: mapped.id,
          created_at: mapped.created_at,
          start_score: mapped.start_score,
          legs_to_win: mapped.legs_to_win,
          players,
        };
      });
  }, []);

  const handleSpectatorHotkey = useCallback(async () => {
    if (isFetching) return;

    setIsFetching(true);
    try {
      const matches = await fetchLiveMatches();
      if (!matches.length) return;

      if (matches.length === 1) {
        router.push(`/match/${matches[0].id}?spectator=true`);
        return;
      }

      setLiveMatches(matches);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Unable to open spectator mode", error);
    } finally {
      setIsFetching(false);
    }
  }, [fetchLiveMatches, isFetching, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      void handleSpectatorHotkey();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSpectatorHotkey]);

  const playerListByMatch = useMemo(
    () =>
      liveMatches.map((match) => ({
        id: match.id,
        label: match.players.map((player) => player.display_name).join(" vs "),
        meta: `First to ${match.legs_to_win} • ${match.start_score} • ${formatTimeAgo(
          match.created_at
        )}`,
      })),
    [liveMatches]
  );

  const handleSelectMatch = useCallback(
    (matchId: string) => {
      setIsDialogOpen(false);
      setLiveMatches([]);
      router.push(`/match/${matchId}?spectator=true`);
    },
    [router]
  );

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) setLiveMatches([]);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select a live match</DialogTitle>
          <DialogDescription>
            Multiple matches are in progress. Choose one to spectate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {playerListByMatch.map((match) => (
            <Button
              key={match.id}
              variant="outline"
              className="w-full justify-start text-left flex-col items-start gap-1"
              onClick={() => handleSelectMatch(match.id)}
            >
              <span className="font-medium">{match.label}</span>
              <span className="text-xs text-muted-foreground">{match.meta}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
