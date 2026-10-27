import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PlayerHeadshot } from '../components/PlayerHeadshot';
import { TeamLogo } from '../components/TeamLogo';
import { getPlayerProfile } from '../services/players';
import type { PlayerProfileResponse, PlayerProfileStatLine } from '../types/game';

function currentSeasonLabel(date = new Date()) {
  const start = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function seasonsFrom(active: string) {
  const start = Number(active.slice(0, 4));
  return Array.from({ length: 6 }, (_, index) => {
    const year = start - index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
}

function missing(value: ReactNode) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

function statLine(stats: PlayerProfileStatLine | null) {
  return [
    ['GP', stats?.gamesPlayed], ['MIN', stats?.minutes], ['PTS', stats?.points],
    ['REB', stats?.rebounds], ['AST', stats?.assists], ['STL', stats?.steals],
    ['BLK', stats?.blocks], ['FG%', stats?.fieldGoalPercentage],
    ['3P%', stats?.threePointPercentage], ['FT%', stats?.freeThrowPercentage],
  ] as const;
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function PlayerProfile() {
  const { playerId = '' } = useParams();
  const numericId = Number(playerId);
  const [season, setSeason] = useState(currentSeasonLabel());
  const [data, setData] = useState<PlayerProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      setError('That player ID is not valid.');
      setLoading(false);
      return () => controller.abort();
    }
    getPlayerProfile(numericId, season, controller.signal)
      .then(profile => { if (!controller.signal.aborted) setData(profile); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Couldn’t load this player profile. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [numericId, season, attempt]);

  if (loading && data?.playerId !== numericId) return <main className="player-profile-page"><Link className="back-link" to="/players"><ArrowLeft size={15} /> Player leaders</Link><div className="player-profile-skeleton" aria-label="Loading player profile"><i /><i /><i /></div></main>;
  if (error && data?.playerId !== numericId || !data || data.playerId !== numericId) return <main className="player-profile-page"><Link className="back-link" to="/players"><ArrowLeft size={15} /> Player leaders</Link><div className="state-card error-state"><div className="state-icon"><RefreshCw /></div><h1>Couldn’t load this player</h1><p>{error ?? 'Player data is unavailable.'}</p><button type="button" className="primary-button" onClick={() => setAttempt(value => value + 1)}>Try again <RefreshCw size={15} /></button></div></main>;

  const selectedStats = data.currentSeasonStats;
  const bio = [
    ['TEAM', data.team ? <span className="profile-team-value"><TeamLogo team={data.team} className="profile-team-logo" />{data.team.name}</span> : 'Free agent / unavailable'],
    ['JERSEY', data.jerseyNumber ? `#${data.jerseyNumber}` : null],
    ['POSITION', data.position], ['HEIGHT', data.height], ['WEIGHT', data.weight ? `${data.weight} lb` : null],
    ['AGE', data.age], ['NATIONALITY', data.nationality],
    ['DRAFT', data.draft.year && data.draft.year !== 'Undrafted' ? `${data.draft.year} · Round ${missing(data.draft.round)} · Pick ${missing(data.draft.number)}` : data.draft.year || '—'],
  ] as const;

  return <main className="player-profile-page">
    <Link className="back-link" to="/players"><ArrowLeft size={15} /> Player leaders</Link>
    <section className="player-profile-hero">
      <PlayerHeadshot name={data.name} url={data.headshotUrl} className="player-profile-headshot" />
      <div className="player-profile-main"><p className="eyebrow muted">NBA PLAYER PROFILE</p><h1>{data.name}<span className="orange">.</span></h1><p>{data.team?.name ?? 'Team unavailable'}{data.position ? ` · ${data.position}` : ''}</p></div>
      <span className="player-profile-id">PLAYER ID <b>{data.playerId}</b></span>
    </section>
    <section className="player-profile-bio" aria-label="Player information">{bio.map(([label, value]) => <div className="player-bio-item" key={label}><span>{label}</span><strong>{missing(value)}</strong></div>)}</section>

    <section className="player-profile-stats" aria-labelledby="current-season-heading">
      <header className="player-profile-section-heading"><div><p className="eyebrow muted">SEASON PERFORMANCE</p><h2 id="current-season-heading">Current-season stats<span className="orange">.</span></h2></div><label>SEASON<select value={season} onChange={event => setSeason(event.target.value)} aria-label="Select player statistics season">{seasonsFrom(currentSeasonLabel()).map(value => <option value={value} key={value}>{value}</option>)}</select></label></header>
      {error && data.playerId === numericId ? <div className="profile-no-stats" role="alert">{error} <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : loading && data.season !== season ? <div className="player-stat-cards-skeleton" aria-label="Loading statistics" aria-busy="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div> : selectedStats ? <div className="player-stat-cards">{statLine(selectedStats).map(([label, value]) => <div className="player-stat-tile" key={label}><span>{label}</span><strong>{label === 'FG%' || label === '3P%' || label === 'FT%' ? percent(value) : missing(value)}</strong></div>)}</div> : <p className="profile-no-stats">No regular-season statistics are available for {season}.</p>}
    </section>

    <section className="player-career-section"><header className="player-profile-section-heading"><div><p className="eyebrow muted">CAREER TOTALS</p><h2>Career statistics<span className="orange">.</span></h2></div></header>
      {data.careerStats ? <div className="player-profile-table-wrap" role="region" aria-label="Career statistics" tabIndex={0}><table className="player-profile-table"><thead><tr><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody><tr>{statLine(data.careerStats).map(([label, value]) => <td key={label}>{label === 'FG%' || label === '3P%' || label === 'FT%' ? percent(value) : missing(value)}</td>)}</tr></tbody></table></div> : <p className="profile-no-stats">Career statistics are unavailable.</p>}
    </section>

    <section className="player-career-section"><header className="player-profile-section-heading"><div><p className="eyebrow muted">REGULAR SEASON</p><h2>Season-by-season<span className="orange">.</span></h2></div></header>
      {data.seasonStats.length ? <div className="player-profile-table-wrap" role="region" aria-label="Season-by-season player statistics" tabIndex={0}><table className="player-profile-table player-season-table"><thead><tr><th>SEASON</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead><tbody>{[...data.seasonStats].reverse().map(row => <tr key={row.season}><th scope="row">{row.season}</th>{statLine(row).map(([label, value]) => <td key={label}>{label === 'FG%' || label === '3P%' || label === 'FT%' ? percent(value) : missing(value)}</td>)}</tr>)}</tbody></table></div> : <p className="profile-no-stats">Season statistics are unavailable.</p>}
    </section>
  </main>;
}
