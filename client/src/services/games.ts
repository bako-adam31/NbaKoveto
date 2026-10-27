import type { GameDetailsResponse, GamesResponse } from '../types/game';
import type { GamesWindowResponse, TeamsResponse } from '../types/game';
import type { TeamRosterResponse } from '../types/game';
import type { PlayerLeadersResponse } from '../types/game';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const WINDOW_TTL_MS = 45_000;
const TEAMS_TTL_MS = 60 * 60_000;
const windowCache = new Map<string, { expiresAt: number; data: GamesWindowResponse }>();
const windowRequests = new Map<string, Promise<GamesWindowResponse>>();
let teamsCache: { expiresAt: number; data: TeamsResponse } | null = null;
let teamsRequest: Promise<TeamsResponse> | null = null;
const rosterCache = new Map<string, { expiresAt: number; data: TeamRosterResponse }>();
const playerLeadersCache = new Map<string, { expiresAt: number; data: PlayerLeadersResponse }>();
const playerLeadersRequests = new Map<string, Promise<PlayerLeadersResponse>>();
const gameDetailsCache = new Map<string, { expiresAt: number; data: GameDetailsResponse }>();

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let message = fallback;
    try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : message; } catch { /* keep fallback */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function getGames(day: string, signal?: AbortSignal): Promise<GamesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/games?date=${encodeURIComponent(day)}`, { signal });
  return responseJson<GamesResponse>(response, 'We couldn’t load the NBA schedule. Please try again.');
}

export function getGamesWindow(startDate: string, timezone: string): Promise<GamesWindowResponse> {
  const key = `${startDate}:${timezone}`;
  const cached = windowCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const inFlight = windowRequests.get(key);
  if (inFlight) return inFlight;
  const query = new URLSearchParams({ start_date: startDate, days: '3', timezone });
  const request = fetch(`${API_BASE_URL}/api/games/window?${query}`)
    .then(response => responseJson<GamesWindowResponse>(response, 'We couldn’t load the upcoming NBA games. Please try again.'))
    .then(data => { windowCache.set(key, { expiresAt: Date.now() + WINDOW_TTL_MS, data }); return data; })
    .finally(() => windowRequests.delete(key));
  windowRequests.set(key, request);
  return request;
}

export async function getGameDetails(gameId: string, signal?: AbortSignal): Promise<GameDetailsResponse> {
  const cached = gameDetailsCache.get(gameId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}`, { signal });
  const data = await responseJson<GameDetailsResponse>(response, 'We couldn’t load this game’s box score. Please try again.');
  if (!data.boxScoreError) gameDetailsCache.set(gameId, { expiresAt: Date.now() + 10 * 60_000, data });
  return data;
}

export function getTeams(): Promise<TeamsResponse> {
  if (teamsCache && teamsCache.expiresAt > Date.now()) return Promise.resolve(teamsCache.data);
  if (teamsRequest) return teamsRequest;
  teamsRequest = fetch(`${API_BASE_URL}/api/teams`)
    .then(response => responseJson<TeamsResponse>(response, 'We couldn’t load the NBA teams. Please try again.'))
    .then(data => { teamsCache = { expiresAt: Date.now() + TEAMS_TTL_MS, data }; return data; })
    .finally(() => { teamsRequest = null; });
  return teamsRequest;
}

export async function getTeamRoster(teamId: number, signal?: AbortSignal): Promise<TeamRosterResponse> {
  const cached = rosterCache.get(String(teamId));
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}/roster`, { signal });
  const data = await responseJson<TeamRosterResponse>(response, 'We couldn’t load this team’s roster. Please try again.');
  rosterCache.set(String(teamId), { expiresAt: Date.now() + 60 * 60_000, data });
  return data;
}

export function getPlayerLeaders(season?: string): Promise<PlayerLeadersResponse> {
  const key = season ?? 'current';
  const cached = playerLeadersCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const inFlight = playerLeadersRequests.get(key);
  if (inFlight) return inFlight;
  const query = season ? `?season=${encodeURIComponent(season)}` : '';
  const request = fetch(`${API_BASE_URL}/api/players/leaders${query}`)
    .then(response => responseJson<PlayerLeadersResponse>(response, 'We couldn’t load NBA player statistics. Please try again.'))
    .then(data => {
      playerLeadersCache.set(key, { expiresAt: Date.now() + 5 * 60_000, data });
      return data;
    })
    .finally(() => playerLeadersRequests.delete(key));
  playerLeadersRequests.set(key, request);
  return request;
}
