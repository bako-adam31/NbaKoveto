import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import { TeamLogo } from './TeamLogo';
import { getStandings, type StandingTeam, type StandingsResponse } from '../services/standings';

function ConferenceTable({ name, teams }: { name: 'East' | 'West'; teams: StandingTeam[] }) {
  const label = name === 'East' ? 'Eastern Conference' : 'Western Conference';
  return <section className="home-standings-card" aria-labelledby={`home-${name.toLowerCase()}-heading`}>
    <header className="home-standings-card-heading"><div><p className="eyebrow muted">REGULAR SEASON</p><h3 id={`home-${name.toLowerCase()}-heading`}>{label}</h3></div><span>{teams.length || '—'} TEAMS</span></header>
    {teams.length ? <div className="home-standings-scroll"><table className="home-standings-table"><thead><tr><th scope="col">#</th><th scope="col">TEAM</th><th scope="col">W</th><th scope="col">L</th><th scope="col">PCT</th><th scope="col">GB</th></tr></thead><tbody>{teams.map(team => <tr className={`standing-row ${team.qualification}`} key={team.id}>
      <td className="standing-rank">{team.rank}</td><th scope="row"><span className="standing-team"><TeamLogo team={team} className="standing-logo" /><span>{team.name}</span></span></th><td>{team.wins ?? '—'}</td><td>{team.losses ?? '—'}</td><td>{team.winPercentage === null ? '—' : team.winPercentage.toFixed(3).replace(/^0/, '')}</td><td>{team.gamesBehind === null || team.gamesBehind === 0 ? '—' : team.gamesBehind.toFixed(1).replace(/\.0$/, '')}</td>
    </tr>)}</tbody></table></div> : <div className="home-standings-empty"><Trophy size={18} /><span>No standings are available for this conference.</span></div>}
    <p className="home-standings-legend"><i className="playoff-key" /> Playoff <i className="playin-key" /> Play-In</p>
  </section>;
}

function StandingsSkeleton() {
  return <div className="home-standings-grid" aria-label="Loading NBA standings" aria-busy="true">{['east', 'west'].map(side => <section className="home-standings-skeleton" key={side}><i />{Array.from({ length: 10 }, (_, index) => <span key={index} />)}</section>)}</div>;
}

export function HomeStandings() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async (initial: boolean) => {
      if (inFlight) return;
      inFlight = true;
      if (initial) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await getStandings();
        if (active) { setData(result); setError(null); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load the NBA standings. Please try again.');
      } finally {
        inFlight = false;
        if (active) { setLoading(false); setRefreshing(false); }
      }
    };
    void load(true);
    const interval = window.setInterval(() => { void load(false); }, 70_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [attempt]);

  return <section className="home-standings-section" aria-labelledby="home-standings-heading">
    <header className="home-standings-heading"><div><p className="eyebrow muted">THE RACE TO THE PLAYOFFS</p><h2 id="home-standings-heading">NBA Standings<span className="orange">.</span></h2><p>Conference races, updated with the latest regular-season results.</p></div>{data && <div className="home-standings-meta"><span>{data.season} SEASON</span><small>{refreshing ? 'UPDATING…' : 'AUTO-REFRESH · 70 SEC'}</small></div>}</header>
    {loading ? <StandingsSkeleton /> : error && !data ? <div className="state-card error-state home-standings-error"><div className="state-icon"><RefreshCw /></div><h3>Couldn’t load the standings</h3><p>{error}</p><button className="primary-button" type="button" onClick={retry}>Try again <RefreshCw size={15} /></button></div> : <>
      {error && <div className="home-standings-refresh-error" role="status">Standings refresh failed: {error} <button type="button" onClick={retry}>Retry</button></div>}
      <div className="home-standings-grid"><ConferenceTable name="East" teams={data?.conferences.East ?? []} /><ConferenceTable name="West" teams={data?.conferences.West ?? []} /></div>
      <p className="home-standings-source">Playoff seeds 1–6 · Play-In seeds 7–10 · Standings supplied by NBA Stats.</p>
    </>}
  </section>;
}
