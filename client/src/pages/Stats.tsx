import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { TeamLogo } from '../components/TeamLogo';
import { getTeamStats, type TeamSeasonStats, type TeamStatsResponse } from '../services/teamStats';

type StatMetric = {
  id: string;
  title: string;
  field: keyof TeamSeasonStats;
  unit: string;
  direction?: 'asc' | 'desc';
  format?: 'percent' | 'signed' | 'streak';
};
type StatGroup = { id: string; title: string; description: string; metrics: StatMetric[] };

const GROUPS: StatGroup[] = [
  { id: 'offense', title: 'Offense', description: 'Scoring and creation, per game', metrics: [
    { id: 'points', title: 'Points per game', field: 'pointsPerGame', unit: 'PPG' },
    { id: 'threes', title: 'Three-pointers made', field: 'threePointersMadePerGame', unit: '3PM/G' },
    { id: 'field-goal', title: 'Field goal percentage', field: 'fieldGoalPercentage', unit: 'FG%' , format: 'percent' },
    { id: 'assists', title: 'Assists per game', field: 'assistsPerGame', unit: 'APG' },
    { id: 'rebounds', title: 'Rebounds per game', field: 'reboundsPerGame', unit: 'RPG' },
  ] },
  { id: 'defense', title: 'Defense', description: 'Opponent scoring and stops, per game', metrics: [
    { id: 'opponent-points', title: 'Opponent points per game', field: 'opponentPointsPerGame', unit: 'OPP PPG', direction: 'asc' },
    { id: 'steals', title: 'Steals per game', field: 'stealsPerGame', unit: 'SPG' },
    { id: 'blocks', title: 'Blocks per game', field: 'blocksPerGame', unit: 'BPG' },
    { id: 'opponent-fg', title: 'Opponent field goal percentage', field: 'opponentFieldGoalPercentage', unit: 'OPP FG%', direction: 'asc', format: 'percent' },
  ] },
  { id: 'performance', title: 'Team Performance', description: 'Standings and momentum', metrics: [
    { id: 'win-percentage', title: 'Win percentage', field: 'winPercentage', unit: 'WIN%', format: 'percent' },
    { id: 'wins', title: 'Total wins', field: 'wins', unit: 'W' },
    { id: 'differential', title: 'Point differential', field: 'pointDifferential', unit: 'PTS/G', format: 'signed' },
    { id: 'streak', title: 'Current streak', field: 'currentStreak', unit: 'STREAK', format: 'streak' },
  ] },
];

function currentSeasonLabel(date = new Date()) {
  const startYear = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function seasonChoices(season: string) {
  const start = Number(season.slice(0, 4));
  return Array.from({ length: 6 }, (_, index) => {
    const year = start - index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
}

function numericValue(team: TeamSeasonStats, field: keyof TeamSeasonStats): number | null {
  const value = team[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function streakValue(team: TeamSeasonStats) {
  const match = team.currentStreak?.match(/([WL])\s*(\d+)/i);
  if (!match) return null;
  return (match[1].toUpperCase() === 'W' ? 1 : -1) * Number(match[2]);
}

function formatValue(team: TeamSeasonStats, metric: StatMetric): string {
  if (metric.format === 'streak') return team.currentStreak?.trim() || '—';
  const value = numericValue(team, metric.field);
  if (value === null) return '—';
  if (metric.format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (metric.format === 'signed') return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sortTeams(teams: TeamSeasonStats[], metric: StatMetric) {
  return [...teams].sort((a, b) => {
    const aValue = metric.format === 'streak' ? streakValue(a) : numericValue(a, metric.field);
    const bValue = metric.format === 'streak' ? streakValue(b) : numericValue(b, metric.field);
    if (aValue === null && bValue !== null) return 1;
    if (bValue === null && aValue !== null) return -1;
    if (aValue !== null && bValue !== null && aValue !== bValue) {
      return (metric.direction === 'asc' ? aValue - bValue : bValue - aValue);
    }
    return a.name.localeCompare(b.name, 'en');
  });
}

function Leaderboard({ metric, teams }: { metric: StatMetric; teams: TeamSeasonStats[] }) {
  const [expanded, setExpanded] = useState(false);
  const ranked = useMemo(() => sortTeams(teams, metric), [teams, metric]);
  const visible = expanded ? ranked : ranked.slice(0, 5);
  return <article className="team-stat-card" aria-labelledby={`team-stat-${metric.id}`}>
    <header className="team-stat-card-heading"><div><p className="eyebrow muted">TEAM LEADERS</p><h3 id={`team-stat-${metric.id}`}>{metric.title}</h3></div><span>{metric.unit}</span></header>
    {visible.length ? <ol className="team-stat-list" aria-label={`${metric.title} rankings`}>
      {visible.map((team, index) => <li className="team-stat-row" key={team.id}>
        <span className={`team-stat-rank${index < 3 ? ' top-three' : ''}`}>{index + 1}</span>
        <TeamLogo team={team} className="team-stat-logo" />
        <span className="team-stat-name" title={team.name}>{team.name}</span>
        <strong className="team-stat-value">{formatValue(team, metric)}</strong>
      </li>)}
    </ol> : <p className="team-stat-empty">No team data is available for this statistic.</p>}
    {ranked.length > 5 && <button className="team-stat-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? <>Show Less <ArrowUp size={14} /></> : <>See All <ArrowDown size={14} /></>}
    </button>}
  </article>;
}

function StatsSkeleton() {
  return <div className="team-stats-groups" aria-label="Loading team statistics" aria-busy="true">
    {GROUPS.map(group => <section className="team-stats-group" key={group.id}><div className="team-stats-group-heading"><i /><i /></div><div className="team-stats-grid">{group.metrics.map(metric => <article className="team-stat-skeleton" key={metric.id}><i />{[0, 1, 2, 3, 4].map(row => <span key={row} />)}</article>)}</div></section>)}
  </div>;
}

export function Stats() {
  const [selectedSeason, setSelectedSeason] = useState('');
  const [data, setData] = useState<TeamStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getTeamStats(selectedSeason || undefined)
      .then(response => { if (active) setData(response); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load team statistics. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedSeason, attempt]);

  const currentSeason = data?.season ?? currentSeasonLabel();
  const choices = seasonChoices(currentSeason);

  return <main className="team-stats-page">
    <header className="team-stats-page-heading"><div><p className="eyebrow muted">THE TEAM NUMBERS</p><h1>Team Stats<span className="orange">.</span></h1><p>Compare the league across both ends of the floor.</p></div>
      <label className="team-stats-season">SEASON<select value={selectedSeason} onChange={event => setSelectedSeason(event.target.value)} aria-label="Select NBA season"><option value="">Current season · {currentSeason}</option>{choices.filter(season => season !== currentSeason).map(season => <option value={season} key={season}>{season}</option>)}</select></label>
    </header>
    {loading ? <StatsSkeleton /> : error ? <div className="state-card error-state team-stats-error"><div className="state-icon"><RefreshCw /></div><h3>Couldn’t load team statistics</h3><p>{error}</p><button className="primary-button" type="button" onClick={() => setAttempt(value => value + 1)}>Try again <RefreshCw size={15} /></button></div> : <div className="team-stats-groups">
      {GROUPS.map(group => <section className="team-stats-group" key={group.id} aria-labelledby={`team-stats-${group.id}`}><header className="team-stats-group-heading"><div><p className="eyebrow muted">{data?.season} · REGULAR SEASON</p><h2 id={`team-stats-${group.id}`}>{group.title}<span className="orange">.</span></h2><p>{group.description}</p></div></header><div className="team-stats-grid">{group.metrics.map(metric => <Leaderboard key={metric.id} metric={metric} teams={data?.teams ?? []} />)}</div></section>)}
    </div>}
  </main>;
}
