import type { PlayerProfileResponse, PlayerSearchResponse } from '../types/game';
import { API_BASE_URL } from './games';

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    let message = fallback;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch { /* keep fallback */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function searchPlayers(query: string, signal?: AbortSignal): Promise<PlayerSearchResponse> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE_URL}/api/players/search?${params}`, { signal });
  return responseJson<PlayerSearchResponse>(response, 'Couldn’t search players. Please try again.');
}

export async function getPlayerProfile(playerId: number, season: string, signal?: AbortSignal): Promise<PlayerProfileResponse> {
  const params = new URLSearchParams({ season });
  const response = await fetch(`${API_BASE_URL}/api/players/${playerId}?${params}`, { signal });
  return responseJson<PlayerProfileResponse>(response, 'Couldn’t load this player profile. Please try again.');
}
