import { useEffect, useState } from 'react';
import { getTeams } from '../services/games';
import type { TeamsResponse } from '../types/game';

export function useTeams(enabled: boolean) {
  const [data, setData] = useState<TeamsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    getTeams()
      .then(result => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load teams. Please try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, attempt]);

  return { data, error, loading, retry: () => setAttempt(value => value + 1) };
}
