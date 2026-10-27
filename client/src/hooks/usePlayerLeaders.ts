import { useEffect, useState } from 'react';
import { getPlayerLeaders } from '../services/games';
import type { PlayerLeadersResponse } from '../types/game';

export function usePlayerLeaders(season?: string) {
  const [data, setData] = useState<PlayerLeadersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getPlayerLeaders(season)
      .then(result => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load player statistics. Please try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [season, attempt]);

  return { data, error, loading, retry: () => setAttempt(value => value + 1) };
}
