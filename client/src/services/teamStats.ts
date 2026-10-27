import { API_BASE_URL } from './games';

export type TeamSeasonStats = {
  id: number;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  gamesPlayed: number | null;
  pointsPerGame: number | null;
  threePointersMadePerGame: number | null;
  fieldGoalPercentage: number | null;
  assistsPerGame: number | null;
  reboundsPerGame: number | null;
  opponentPointsPerGame: number | null;
  stealsPerGame: number | null;
  blocksPerGame: number | null;
  opponentFieldGoalPercentage: number | null;
  wins: number | null;
  winPercentage: number | null;
  pointDifferential: number | null;
  currentStreak: string | null;
};

export type TeamStatsResponse = {
  season: string;
  perMode: 'PerGame';
  teams: TeamSeasonStats[];
};

const cache = new Map<string, { expiresAt: number; data: TeamStatsResponse }>();
const requests = new Map<string, Promise<TeamStatsResponse>>();

export function getTeamStats(season?: string): Promise<TeamStatsResponse> {
  const key = season ?? 'current';
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const pending = requests.get(key);
  if (pending) return pending;
  const query = season ? `?season=${encodeURIComponent(season)}` : '';
  const url = `${API_BASE_URL}/api/teams/stats${query}`;
  const request = fetch(url).then(async response => {
    if (!response.ok) {
      let message = 'Couldn’t load team statistics. Please try again.';
      try {
        const body = await response.json();
        if (typeof body.detail === 'string') message = body.detail;
      } catch { /* Use the readable fallback. */ }
      throw new Error(message);
    }
    return response.json() as Promise<TeamStatsResponse>;
  }).then(data => {
    cache.set(key, { expiresAt: Date.now() + 10 * 60_000, data });
    return data;
  }).finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}
