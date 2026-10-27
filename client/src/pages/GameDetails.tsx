import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PlayerHeadshot } from '../components/PlayerHeadshot';
import { TeamLogo } from '../components/TeamLogo';
import { getGameDetails } from '../services/games';
import type { GameDetailsResponse } from '../types/game';

function display(value: number | string | null | undefined) { return value === null || value === undefined || value === '' ? '—' : value; }
function TeamSummary({ team, winner, side }: { team: GameDetailsResponse['awayTeam']; winner: boolean; side: 'away' | 'home' }) {
  return <div className={`detail-team ${side} ${winner ? 'winner' : ''}`} aria-label={`${side === 'away' ? 'Away' : 'Home'} team: ${team.name}`}>
    {side === 'away' && <TeamLogo team={team} className="detail-team-logo" />}
    <div className="detail-team-copy"><h2 title={team.name}>{team.name}</h2><span>{team.abbreviation}</span></div>
    {side === 'home' && <TeamLogo team={team} className="detail-team-logo" />}
  </div>;
}
function StatCell({ value, unavailable = false }: { value: number | null; unavailable?: boolean }) { return <td>{unavailable ? '—' : display(value)}</td>; }
function BoxScoreTable({ title, players, team }: { title: string; players: NonNullable<GameDetailsResponse['players']>['away']; team: GameDetailsResponse['awayTeam'] }) {
  return <section className="boxscore-team"><header className="boxscore-team-heading"><div><p className="eyebrow muted">PLAYER BOX SCORE</p><h2><TeamLogo team={team} className="boxscore-team-logo" />{title}</h2></div><span>{players.length} PLAYERS</span></header><div className="boxscore-scroll" role="region" aria-label={`${title} player box score`} tabIndex={0}><table className="boxscore-table"><thead><tr><th scope="col">PLAYER</th><th scope="col">MIN</th><th scope="col">PTS</th><th scope="col">REB</th><th scope="col">AST</th><th scope="col">FG</th><th scope="col">3PT</th><th scope="col">FT</th><th scope="col">STL</th><th scope="col">BLK</th><th scope="col">TO</th><th scope="col">+/-</th></tr></thead><tbody>{players.map((player, index) => <tr key={`${player.playerId}-${index}`} className={player.didNotPlay ? 'did-not-play' : ''}><th scope="row"><span className="boxscore-player"><PlayerHeadshot name={player.name} url={player.headshotUrl} className="boxscore-headshot" /><span><b>{player.name}</b><small>{player.didNotPlay ? player.comment || 'Did not play' : player.jerseyNumber ? `#${player.jerseyNumber}` : '—'}</small></span></span></th><td>{player.didNotPlay ? player.comment || 'DNP' : display(player.minutes)}</td><StatCell value={player.points} unavailable={player.didNotPlay} /><StatCell value={player.rebounds} unavailable={player.didNotPlay} /><StatCell value={player.assists} unavailable={player.didNotPlay} /><td>{player.didNotPlay ? '—' : `${display(player.fieldGoalsMade)}/${display(player.fieldGoalsAttempted)}`}</td><td>{player.didNotPlay ? '—' : `${display(player.threePointersMade)}/${display(player.threePointersAttempted)}`}</td><td>{player.didNotPlay ? '—' : `${display(player.freeThrowsMade)}/${display(player.freeThrowsAttempted)}`}</td><StatCell value={player.steals} unavailable={player.didNotPlay} /><StatCell value={player.blocks} unavailable={player.didNotPlay} /><StatCell value={player.turnovers} unavailable={player.didNotPlay} /><td>{player.didNotPlay || player.plusMinus === null ? '—' : player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}</td></tr>)}</tbody></table></div></section>;
}

export function GameDetails() {
  const { gameId = '' } = useParams();
  const [data, setData] = useState<GameDetailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    getGameDetails(gameId, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Couldn’t load this game. Please try again.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [gameId, attempt]);

  if (loading && data?.gameId !== gameId) return <main className="game-details-page"><Link className="back-link" to="/games"><ArrowLeft size={15} /> All games</Link><div className="game-detail-skeleton" aria-label="Loading game details"><i /><i /><i /></div></main>;
  if (error && data?.gameId !== gameId || !data || data.gameId !== gameId) return <main className="game-details-page"><Link className="back-link" to="/games"><ArrowLeft size={15} /> All games</Link><div className="state-card error-state"><div className="state-icon"><RefreshCw /></div><h1>Couldn’t load this game</h1><p>{error ?? 'The game data is unavailable.'}</p><button className="primary-button" onClick={retry}>Try again <RefreshCw size={15} /></button></div></main>;

  const awayWins = (data.awayTeam.score ?? -1) > (data.homeTeam.score ?? -1);
  const homeWins = (data.homeTeam.score ?? -1) > (data.awayTeam.score ?? -1);
  const gameDate = data.scheduledStartTime ? new Date(data.scheduledStartTime) : data.gameDate ? new Date(`${data.gameDate.slice(0, 10)}T12:00:00`) : null;
  const time = data.scheduledStartTime ? new Date(data.scheduledStartTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
  return <main className="game-details-page"><Link className="back-link" to="/games"><ArrowLeft size={15} /> All games</Link><p className="eyebrow muted game-detail-kicker">FINAL BOX SCORE</p><section className="game-detail-summary"><div className="game-detail-summary-top"><span className="final-pill">FINAL</span><span>{gameDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? 'Date unavailable'}{time ? ` · ${time}` : ''}</span></div><div className="game-detail-scoreline" aria-label={`${data.awayTeam.name} ${display(data.awayTeam.score)}, ${data.homeTeam.name} ${display(data.homeTeam.score)}, final`}><TeamSummary team={data.awayTeam} winner={awayWins} side="away" /><strong className={`detail-score ${awayWins ? 'winner' : ''}`}>{display(data.awayTeam.score)}</strong><span className="score-divider" aria-hidden="true">–</span><strong className={`detail-score ${homeWins ? 'winner' : ''}`}>{display(data.homeTeam.score)}</strong><TeamSummary team={data.homeTeam} winner={homeWins} side="home" /></div><div className="game-detail-arena">{data.arenaName || 'Arena information unavailable'}</div></section>
    <section className="period-score-section"><div className="detail-section-title"><div><p className="eyebrow muted">THE BREAKDOWN</p><h2>Scoring by period</h2></div></div>{data.awayTeam.periods.length || data.homeTeam.periods.length ? <div className="period-score-scroll"><table className="period-score-table"><thead><tr><th scope="col">TEAM</th>{Array.from({ length: Math.max(data.awayTeam.periods.length, data.homeTeam.periods.length) }, (_, index) => <th scope="col" key={index}>{index < 4 ? `Q${index + 1}` : `OT${index - 3}`}</th>)}<th scope="col">FINAL</th></tr></thead><tbody>{[data.awayTeam, data.homeTeam].map(team => <tr key={team.id}><th scope="row"><TeamLogo team={team} className="period-team-logo" />{team.abbreviation}</th>{Array.from({ length: Math.max(data.awayTeam.periods.length, data.homeTeam.periods.length) }, (_, index) => <td key={index}>{team.periods.find(period => period.period === index + 1)?.score ?? '—'}</td>)}<td className="period-final">{display(team.score)}</td></tr>)}</tbody></table></div> : <p className="period-score-empty">Period scoring is not available for this game.</p>}</section>
    <div className="boxscore-heading"><div><p className="eyebrow muted">THE NUMBERS</p><h2>Player box score<span className="orange">.</span></h2></div></div>
    {data.boxScoreError ? <div className="boxscore-unavailable" role="alert"><p>{data.boxScoreError} The final score above is still available.</p><button className="text-button" onClick={retry}>Retry player stats <RefreshCw size={14} /></button></div> : !data.players ? <div className="boxscore-unavailable"><p>Player statistics are not available.</p><button className="text-button" onClick={retry}>Try again <RefreshCw size={14} /></button></div> : <div className="boxscore-teams">{data.players.away.length ? <BoxScoreTable title={data.awayTeam.name} players={data.players.away} team={data.awayTeam} /> : <section className="boxscore-team"><header className="boxscore-team-heading"><h2>{data.awayTeam.name}</h2></header><p className="period-score-empty">No player statistics were returned.</p></section>}{data.players.home.length ? <BoxScoreTable title={data.homeTeam.name} players={data.players.home} team={data.homeTeam} /> : <section className="boxscore-team"><header className="boxscore-team-heading"><h2>{data.homeTeam.name}</h2></header><p className="period-score-empty">No player statistics were returned.</p></section>}</div>}
  </main>;
}
