import { useMemo } from 'react';
import { ArrowRight, CalendarDays, Clock3, RefreshCw, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGameWindow } from '../hooks/useGameWindow';
import { TeamLogo } from '../components/TeamLogo';
import type { Game } from '../types/game';

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function shiftDate(day: string, offset: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function dayLabel(day: string, today: string) {
  if (day === shiftDate(today, -1)) return 'Yesterday';
  if (day === today) return 'Today';
  if (day === shiftDate(today, 1)) return 'Tomorrow';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
function gameTime(game: Game) {
  return game.localStartsAt ? new Date(game.localStartsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;
}
function statusLabel(game: Game) {
  if (game.status === 'live') return game.period ? `LIVE · ${game.statusText || `Q${game.period}`}` : `LIVE · ${game.statusText}`;
  if (game.status === 'final') return 'FINAL';
  if (game.status === 'scheduled') return 'SCHEDULED';
  return game.statusText || 'STATUS UNAVAILABLE';
}

function GameListing({ game }: { game: Game }) {
  const canOpen = game.status === 'final' && game.awayTeam.score !== null && game.homeTeam.score !== null && /^\d{10}$/.test(game.id);
  const hasScore = game.status === 'live' || game.status === 'final';
  const content = (
    <>
      <div className="full-game-meta">
        <span className={`full-game-status ${game.status}`}><i />{statusLabel(game)}</span>
        <span>{game.status === 'scheduled' ? <><Clock3 size={14} />{gameTime(game) ?? 'Start time unavailable'}</> : game.status === 'live' && game.clock ? game.clock : game.statusText}</span>
      </div>
      <div className="full-game-matchup">
        <div className="full-game-team away">
          <TeamLogo team={game.awayTeam} className="full-game-logo" />
          <span className="full-game-team-copy">
            <span className="full-game-team-name" title={game.awayTeam.name}>{game.awayTeam.name}</span>
            <span className="full-game-team-abbr">{game.awayTeam.abbreviation}</span>
          </span>
        </div>
        <strong className="full-game-score away-score">{hasScore ? game.awayTeam.score ?? '—' : ''}</strong>
        <span className="full-game-score-separator" aria-hidden="true">–</span>
        <strong className="full-game-score home-score">{hasScore ? game.homeTeam.score ?? '—' : ''}</strong>
        <div className="full-game-team home">
          <span className="full-game-team-copy">
            <span className="full-game-team-name" title={game.homeTeam.name}>{game.homeTeam.name}</span>
            <span className="full-game-team-abbr">{game.homeTeam.abbreviation}</span>
          </span>
          <TeamLogo team={game.homeTeam} className="full-game-logo" />
        </div>
      </div>
      {canOpen && <span className="full-game-link-hint">Final box score <ArrowRight size={14} /></span>}
    </>
  );
  return canOpen
    ? <Link className={`full-game-card ${game.status}`} to={`/games/${game.id}`} aria-label={`${game.awayTeam.name} at ${game.homeTeam.name}, final ${game.awayTeam.score} to ${game.homeTeam.score}. Open box score`}>{content}</Link>
    : <article className={`full-game-card ${game.status}`} aria-label={`${game.awayTeam.name} at ${game.homeTeam.name}. ${statusLabel(game)}`}>{content}</article>;
}

export function Games() {
  const today = useMemo(localToday, []);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  // This is deliberately the same endpoint, start date and three-day window as the Games dropdown.
  const { data, error, loading, retry } = useGameWindow(true, today, timezone);
  const byDate = new Map<string, Game[]>();
  for (const game of data?.games ?? []) {
    const day = game.localDate ?? game.date;
    byDate.set(day, [...(byDate.get(day) ?? []), game]);
  }
  return (
    <main className="games-page">
      <header className="games-page-heading">
        <div><p className="eyebrow muted">THE SCOREBOARD</p><h1>Games<span className="orange">.</span></h1><p>Every matchup across the next three local calendar days.</p></div>
        <span className="games-timezone"><CalendarDays size={15} /> LOCAL START TIMES</span>
      </header>
      {loading ? <div className="full-games-groups" aria-label="Loading games">{Array.from({ length: 3 }, (_, day) => <section className="full-games-group" key={day}><div className="full-games-day-skeleton" /><div className="full-game-skeleton" /><div className="full-game-skeleton" /></section>)}</div>
        : error ? <div className="state-card error-state games-page-error"><div className="state-icon"><RefreshCw /></div><h2>Couldn’t load the scoreboard</h2><p>{error}</p><button className="primary-button" onClick={retry}>Try again <RefreshCw size={15} /></button></div>
          : <div className="full-games-groups">{Array.from({ length: data?.days ?? 3 }, (_, index) => shiftDate(data?.startDate ?? today, index)).map(day => {
            const games = byDate.get(day) ?? [];
            return <section className="full-games-group" key={day} aria-labelledby={`games-${day}`}><div className="full-games-group-heading"><div><p className="eyebrow muted">{dayLabel(day, today)}</p><h2 id={`games-${day}`}>{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</h2></div><span>{games.length} {games.length === 1 ? 'GAME' : 'GAMES'}</span></div>{games.length ? <div className="full-games-list">{games.map(game => <GameListing game={game} key={game.id} />)}</div> : <div className="full-games-empty"><Trophy size={19} /><p>No games scheduled for this date.</p></div>}</section>;
          })}</div>}
      {!loading && !error && data && !data.games.length && <p className="games-source-note">Scores and schedules are provided by NBA.com.</p>}
    </main>
  );
}
