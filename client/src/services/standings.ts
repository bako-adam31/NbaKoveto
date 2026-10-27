import { API_BASE_URL } from './games';

export type StandingTeam = {
  id: number;
  name: string;
  abbreviation: string;
  logoUrl: string | null;
  conference: 'East' | 'West';
  rank: number;
  wins: number | null;
  losses: number | null;
  winPercentage: number | null;
  gamesBehind: number | null;
  qualification: 'playoff' | 'play-in' | 'outside';
};
export type StandingsResponse = {
  season: string;
  updatedAt: string;
  conferences: { East: StandingTeam[]; West: StandingTeam[] };
};

let cache: { expiresAt: number; data: StandingsResponse } | null = null;
let request: Promise<StandingsResponse> | null = null;

export function getStandings(): Promise<StandingsResponse> {
  if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.data);
  if (request) return request;
  request = fetch(`${API_BASE_URL}/api/standings`).then(async response => {
    if (!response.ok) {
      let message = 'Couldn’t load the NBA standings. Please try again.';
      try {
        const body = await response.json();
        if (typeof body.detail === 'string') message = body.detail;
      } catch { /* Use the readable fallback. */ }
      throw new Error(message);
    }
    return response.json() as Promise<StandingsResponse>;
  }).then(data => {
    cache = { expiresAt: Date.now() + 45_000, data };
    return data;
  }).finally(() => { request = null; });
  return request;
}
