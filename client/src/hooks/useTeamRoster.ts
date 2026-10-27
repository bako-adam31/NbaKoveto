import { useCallback, useEffect, useState } from 'react';
import { getTeamRoster } from '../services/games';
import type { TeamRosterResponse } from '../types/game';

export function useTeamRoster(teamId: number | null) {
  const [data, setData] = useState<TeamRosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [requestId, setRequestId] = useState<number | null>(null);

  useEffect(() => {
    if (teamId === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setRequestId(teamId);
    setData(null);
    setError(null);
    setLoading(true);
    getTeamRoster(teamId, controller.signal)
      .then(result => setData(result))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Couldn’t load this roster. Please try again.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [teamId, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const currentData = data?.team.id === teamId ? data : null;
  const currentError = requestId === teamId ? error : null;
  const currentLoading = teamId !== null && (requestId !== teamId || (loading && currentError === null));
  return { data: currentData, error: currentError, loading: currentLoading, retry };
}
