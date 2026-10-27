export type Team = { id: number; name: string; abbreviation: string; city: string; logoUrl: string | null; score: number | null };
export type Game = { id: string; date: string; localDate?: string; startsAt: string | null; localStartsAt?: string | null; status: 'scheduled' | 'live' | 'final' | 'unknown'; statusText: string; period: number; clock: string | null; homeTeam: Team; awayTeam: Team };
export type GamesResponse = { date: string; timezone: string; games: Game[] };
export type GamesWindowResponse = { startDate: string; days: number; timezone: string; games: Game[] };
export type GameDetailTeam = { id: number; name: string; abbreviation: string; logoUrl: string | null; score: number | null; periods: { period: number; label: string; score: number }[] };
export type BoxScorePlayer = {
  playerId: number; name: string; headshotUrl: string; jerseyNumber: string | null;
  minutes: string | null; comment: string | null; didNotPlay: boolean;
  points: number | null; rebounds: number | null; assists: number | null;
  fieldGoalsMade: number | null; fieldGoalsAttempted: number | null;
  threePointersMade: number | null; threePointersAttempted: number | null;
  freeThrowsMade: number | null; freeThrowsAttempted: number | null;
  steals: number | null; blocks: number | null; turnovers: number | null; plusMinus: number | null;
};
export type GameDetailsResponse = {
  gameId: string; status: Game['status']; statusText: string; period: number; clock: string | null;
  gameDate: string | null; scheduledStartTime: string | null; arenaName: string | null;
  awayTeam: GameDetailTeam; homeTeam: GameDetailTeam;
  players: { away: BoxScorePlayer[]; home: BoxScorePlayer[] } | null; boxScoreError: string | null;
};
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
export type PlayerSearchResult = {
  playerId: number;
  name: string;
  headshotUrl: string;
  teamId: number | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
};
export type PlayerSearchResponse = { season: string; players: PlayerSearchResult[] };
export type PlayerProfileStatLine = {
  gamesPlayed: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  fieldGoalPercentage: number | null;
  threePointPercentage: number | null;
  freeThrowPercentage: number | null;
};
export type PlayerProfileResponse = {
  playerId: number;
  name: string;
  headshotUrl: string;
  team: { id: number; name: string; abbreviation: string; logoUrl: string } | null;
  jerseyNumber: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  nationality: string | null;
  draft: { year: string | null; round: string | null; number: string | null };
  season: string;
  currentSeasonStats: PlayerProfileStatLine | null;
  careerStats: PlayerProfileStatLine | null;
  seasonStats: Array<PlayerProfileStatLine & { season: string }>;
};
