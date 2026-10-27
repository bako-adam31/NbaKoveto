export type Team = { id: number; name: string; abbreviation: string; city: string; logoUrl: string | null; score: number | null };
export type Game = { id: string; date: string; localDate?: string; startsAt: string | null; localStartsAt?: string | null; status: 'scheduled' | 'live' | 'final' | 'unknown'; statusText: string; period: number; clock: string | null; homeTeam: Team; awayTeam: Team };
export type GamesResponse = { date: string; timezone: string; games: Game[] };
export type GamesWindowResponse = { startDate: string; days: number; timezone: string; games: Game[] };
export type TeamSummary = { id: number; fullName: string; nickname: string; city: string; abbreviation: string; logoUrl: string };
export type TeamsResponse = { teams: TeamSummary[] };
export type RosterPlayer = {
  playerId: number;
  headshotUrl: string;
  name: string | null;
  jerseyNumber: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  age: string | null;
  experience: string | null;
};
export type TeamRosterResponse = {
  team: TeamSummary;
  season: string;
  players: RosterPlayer[];
};
export type PlayerStatsRow = {
  playerId: number;
  name: string;
  headshotUrl: string;
  teamId: number | null;
  teamAbbreviation: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  gamesPlayed: number;
  pointsPerGame: number | null;
  threePointersMadePerGame: number | null;
  assistsPerGame: number | null;
  reboundsPerGame: number | null;
  stealsPerGame: number | null;
  blocksPerGame: number | null;
};
export type PlayerLeadersResponse = {
  season: string;
  perMode: 'PerGame';
  players: PlayerStatsRow[];
};
