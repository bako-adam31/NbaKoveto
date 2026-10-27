import { useMemo, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useGameWindow } from "../hooks/useGameWindow";
import { useTeams } from "../hooks/useTeams";
import { API_BASE_URL } from "../services/games";
import type { Game, TeamSummary } from "../types/game";

function shiftDate(day: string, offset: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function groupLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === shiftDate(today, 1)) return "Tomorrow";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function TeamMark({ team }: { team: TeamSummary | Game["homeTeam"] }) {
  const [failed, setFailed] = useState(false);
  return team.logoUrl && !failed ? (
    <img
      className="dropdown-team-logo"
      src={`${API_BASE_URL}${team.logoUrl}`}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="dropdown-team-fallback" aria-hidden="true">
      {team.abbreviation}
    </span>
  );
}

function GameRow({ game }: { game: Game }) {
  const localTime = game.localStartsAt
    ? new Date(game.localStartsAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const status =
    game.status === "final"
      ? "Final"
      : game.status === "live"
        ? "Live"
        : game.status === "scheduled"
          ? "Scheduled"
          : "Status unavailable";
  const statusText =
    game.status === "scheduled"
      ? (localTime ?? "Time TBD")
      : game.statusText || status;
  const hasScore = game.status === "live" || game.status === "final";
  return (
    <article
      className={`nav-game-row ${game.status}`}
      tabIndex={0}
      aria-label={`${game.awayTeam.name}${hasScore ? ` ${game.awayTeam.score ?? "unavailable"}` : ""} versus ${game.homeTeam.name}${hasScore ? ` ${game.homeTeam.score ?? "unavailable"}` : ""}. ${status}. ${statusText}.`}
    >
      <div className="nav-game-time">
        <span className={`nav-game-status ${game.status}`}>{status}</span>
        <time dateTime={game.startsAt ?? undefined}>{statusText}</time>
      </div>
      <div className="nav-game-teams">
        <div className="nav-game-team">
          <TeamMark team={game.awayTeam} />
          <span className="nav-game-name" title={game.awayTeam.name}>{game.awayTeam.name}</span>
          {hasScore && <strong>{game.awayTeam.score ?? "—"}</strong>}
        </div>
        <span className="nav-game-score-separator" aria-hidden="true">-</span>
        <div className="nav-game-team home">
          {hasScore && <strong>{game.homeTeam.score ?? "—"}</strong>}
          <span className="nav-game-name" title={game.homeTeam.name}>{game.homeTeam.name}</span>
          <TeamMark team={game.homeTeam} />
        </div>
      </div>
    </article>
  );
}

export function GamesDropdown({ enabled }: { enabled: boolean }) {
  const today = useMemo(localToday, []);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const { data, error, loading, retry } = useGameWindow(
    enabled,
    today,
    timezone,
  );
  const byDate = new Map<string, Game[]>();
  for (const game of data?.games ?? []) {
    const key = game.localDate ?? game.date;
    byDate.set(key, [...(byDate.get(key) ?? []), game]);
  }
  return (
    <div
      className="nav-dropdown games-dropdown"
      id="games-dropdown"
      role="region"
      aria-label="NBA games for the next three days"
    >
      <div className="nav-dropdown-heading">
        <div>
          <span className="dropdown-kicker">THE SCOREBOARD</span>
          <h2>Next 3 days</h2>
        </div>
        <span className="dropdown-heading-note">LOCAL TIMES</span>
      </div>
      {loading && (
        <div className="dropdown-loading" role="status" aria-live="polite">
          <span className="dropdown-spinner" /> Loading games…
        </div>
      )}
      {error && (
        <div className="dropdown-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry}>
            Try again <RefreshCw size={13} />
          </button>
        </div>
      )}
      {!loading && !error && (
        <div className="games-dropdown-days">
          {Array.from({ length: 3 }, (_, index) => shiftDate(today, index)).map(
            (day) => {
              const games = byDate.get(day) ?? [];
              return (
                <section
                  className="games-day"
                  key={day}
                  aria-label={groupLabel(day, today)}
                >
                  <div className="games-day-label">
                    <span>{groupLabel(day, today)}</span>
                    <small>
                      {games.length
                        ? `${games.length} ${games.length === 1 ? "GAME" : "GAMES"}`
                        : ""}
                    </small>
                  </div>
                  {games.length ? (
                    games.map((game) => <GameRow game={game} key={game.id} />)
                  ) : (
                    <p className="no-games">No games scheduled</p>
                  )}
                </section>
              );
            },
          )}
        </div>
      )}
      <Link className="nav-dropdown-footer" to="/games">
        Open scoreboard <ArrowRight size={14} />
      </Link>
    </div>
  );
}

export function TeamsDropdown({ enabled }: { enabled: boolean }) {
  const { data, error, loading, retry } = useTeams(enabled);
  return (
    <div
      className="nav-dropdown teams-dropdown"
      id="teams-dropdown"
      role="region"
      aria-label="All NBA teams"
    >
      <div className="nav-dropdown-heading">
        <div>
          <span className="dropdown-kicker">THE LEAGUE</span>
          <h2>NBA Teams</h2>
        </div>
        <span className="dropdown-heading-note">30 TEAMS</span>
      </div>
      {loading && (
        <div className="dropdown-loading" role="status" aria-live="polite">
          <span className="dropdown-spinner" /> Loading teams…
        </div>
      )}
      {error && (
        <div className="dropdown-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry}>
            Try again <RefreshCw size={13} />
          </button>
        </div>
      )}
      {!loading && !error && (
        <div className="teams-dropdown-list" role="list">
          {(data?.teams ?? []).map((team) => (
            <TeamEntry team={team} key={team.id} />
          ))}
        </div>
      )}
      <Link className="nav-dropdown-footer" to="/teams">
        Team pages <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function TeamEntry({ team }: { team: TeamSummary }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      to={`/teams/${team.id}`}
      className="team-dropdown-entry"
      role="listitem"
      aria-label={`${team.fullName}, ${team.abbreviation}`}
    >
      {team.logoUrl && !failed ? (
        <img
          className="dropdown-team-logo"
          src={`${API_BASE_URL}${team.logoUrl}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="dropdown-team-fallback" aria-hidden="true">
          {team.abbreviation}
        </span>
      )}
      <span className="team-dropdown-name">
        {team.fullName}
        <small>{team.abbreviation}</small>
      </span>
    </Link>
  );
}
