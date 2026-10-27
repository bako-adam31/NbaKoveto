import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { PlayerHeadshot } from "../components/PlayerHeadshot";
import { TeamLogo } from "../components/TeamLogo";
import { usePlayerLeaders } from "../hooks/usePlayerLeaders";
import { searchPlayers } from "../services/players";
import type { PlayerSearchResult, PlayerStatsRow } from "../types/game";

function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPlayers([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      searchPlayers(trimmed, controller.signal)
        .then(response => { setPlayers(response.players); setOpen(true); })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setError(reason instanceof Error ? reason.message : "Couldn’t search players. Please try again.");
            setPlayers([]);
            setOpen(true);
          }
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  return <div className="player-search" ref={root}>
    <label className="player-search-input-wrap"><Search size={18} aria-hidden="true" /><span className="sr-only">Search NBA players</span>
      <input type="search" value={query} placeholder="Search players by name…" autoComplete="off" aria-label="Search players" aria-expanded={open && query.trim().length >= 2} aria-controls="player-search-results" aria-autocomplete="list" onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onChange={event => { setQuery(event.target.value); setOpen(event.target.value.trim().length >= 2); }} />
      {loading && <span className="player-search-spinner" aria-label="Searching" />}
    </label>
    {open && query.trim().length >= 2 && <div className="player-search-results" id="player-search-results" role="listbox" aria-label="Player search results" aria-busy={loading}>
      {loading ? <p className="player-search-state">Searching NBA players…</p> : error ? <p className="player-search-state error" role="alert">{error}</p> : players.length ? players.map(player => <Link className="player-search-result" to={`/players/${player.playerId}`} role="option" aria-selected="false" key={player.playerId} onClick={() => setOpen(false)}>
        <PlayerHeadshot name={player.name} url={player.headshotUrl} className="player-search-headshot" />
        <span className="player-search-copy"><strong>{player.name}</strong><small>{player.teamName || "Current team unavailable"}</small></span>
        {player.teamId && player.teamName && player.teamAbbreviation && <TeamLogo team={{ id: player.teamId, name: player.teamName, abbreviation: player.teamAbbreviation, logoUrl: player.teamLogoUrl }} className="player-search-team-logo" />}
      </Link>) : <p className="player-search-state">No players found. Try another name.</p>}
    </div>}
  </div>;
}

type StatField =
  | "pointsPerGame"
  | "threePointersMadePerGame"
  | "assistsPerGame"
  | "reboundsPerGame"
  | "stealsPerGame"
  | "blocksPerGame";
type LeaderboardCategory = {
  id: string;
  title: string;
  field: StatField;
  unit: string;
};

const CATEGORIES: LeaderboardCategory[] = [
  { id: "points", title: "Points", field: "pointsPerGame", unit: "PPG" },
  {
    id: "threes",
    title: "Three-Pointers Made",
    field: "threePointersMadePerGame",
    unit: "3PM/G",
  },
  { id: "assists", title: "Assists", field: "assistsPerGame", unit: "APG" },
  { id: "rebounds", title: "Rebounds", field: "reboundsPerGame", unit: "RPG" },
  { id: "steals", title: "Steals", field: "stealsPerGame", unit: "SPG" },
  { id: "blocks", title: "Blocks", field: "blocksPerGame", unit: "BPG" },
];

function TeamMark({ player }: { player: PlayerStatsRow }) {
  if (!player.teamLogoUrl)
    return (
      <span
        className="leader-team-fallback"
        aria-label={
          player.teamName
            ? `${player.teamName} logo unavailable`
            : "Team unavailable"
        }
      >
        {player.teamAbbreviation || "—"}
      </span>
    );
  return <TeamLogo team={{ id: player.teamId ?? undefined, name: player.teamName || player.teamAbbreviation || "NBA team", abbreviation: player.teamAbbreviation || "—", logoUrl: player.teamLogoUrl }} className="leader-team-logo" />;
}

function LeaderboardCard({
  category,
  players,
}: {
  category: LeaderboardCategory;
  players: PlayerStatsRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = players.slice(0, expanded ? 10 : 3);
  return (
    <section
      className="leaderboard-card"
      aria-labelledby={`${category.id}-heading`}
    >
      <div className="leaderboard-card-heading">
        <div>
          <p className="eyebrow muted">LEAGUE LEADERS</p>
          <h2 id={`${category.id}-heading`}>
            {category.title}
            <span className="orange">.</span>
          </h2>
        </div>
        <span className="leaderboard-mode">PER GAME</span>
      </div>
      {players.length === 0 ? (
        <div className="leaderboard-empty">
          <Users size={20} />
          <span>No eligible player statistics available.</span>
        </div>
      ) : (
        <ol
          className="leaderboard-list"
          id={`${category.id}-list`}
          aria-label={`${category.title} per-game leaders`}
        >
          {visible.map((player, index) => {
            const value = player[category.field];
            return (
              <li className="leaderboard-row" key={player.playerId}>
                <span className={`leader-rank${index < 3 ? " top-three" : ""}`}>
                  {index + 1}
                </span>
                <PlayerHeadshot
                  className="leader-headshot"
                  name={player.name}
                  url={player.headshotUrl}
                />
                <span className="leader-player-name" title={player.name}>
                  {player.name}
                </span>
                <TeamMark player={player} />
                <span className="leader-stat">
                  {value === null ? "—" : value.toFixed(1)}{" "}
                  <small>{category.unit}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {players.length > 3 && (
        <button
          className="leaderboard-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls={`${category.id}-list`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <>
              Show Less <ArrowUp size={14} />
            </>
          ) : (
            <>
              See All <ArrowDown size={14} />
            </>
          )}
        </button>
      )}
    </section>
  );
}

function LeaderboardSkeleton() {
  return (
    <section
      className="leaderboard-card leaderboard-skeleton"
      aria-hidden="true"
    >
      <div className="leader-skeleton-title" />
      {[0, 1, 2].map((index) => (
        <div className="leader-skeleton-row" key={index}>
          <i />
          <span />
          <b />
          <em />
        </div>
      ))}
    </section>
  );
}

export function Players() {
  const { data, error, loading, retry } = usePlayerLeaders();
  const leaders = useMemo(() => {
    const source = data?.players ?? [];
    return CATEGORIES.map((category) => ({
      category,
      players: source
        .filter(
          (player) =>
            player.gamesPlayed > 0 &&
            typeof player[category.field] === "number" &&
            Number.isFinite(player[category.field]) &&
            player[category.field]! >= 0,
        )
        .sort((a, b) => {
          const difference =
            (b[category.field] as number) - (a[category.field] as number);
          return (
            difference ||
            a.name.localeCompare(b.name, "en") ||
            a.playerId - b.playerId
          );
        })
        .slice(0, 10),
    }));
  }, [data]);

  return (
    <main className="players-page">
      <header className="players-page-heading">
        <div>
          <p className="eyebrow muted">THE NUMBERS GAME</p>
          <h1>
            Player Leaders<span className="orange">.</span>
          </h1>
          <p>
            Top performers across the league, ranked by regular-season averages.
          </p>
        </div>
        {data && (
          <span className="players-season">
            {data.season}
            <small>REGULAR SEASON · PER GAME</small>
          </span>
        )}
      </header>
      <PlayerSearch />
      {loading ? (
        <div
          className="leaderboards-grid"
          aria-label="Loading NBA player leaders"
          aria-busy="true"
        >
          {CATEGORIES.map((category) => (
            <LeaderboardSkeleton key={category.id} />
          ))}
        </div>
      ) : error ? (
        <div className="state-card error-state players-error">
          <div className="state-icon">
            <RefreshCw />
          </div>
          <h3>Couldn’t load player leaders</h3>
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={retry}>
            Try again <RefreshCw size={15} />
          </button>
        </div>
      ) : (
        <div className="leaderboards-grid">
          {leaders.map(({ category, players }) => (
            <LeaderboardCard
              key={category.id}
              category={category}
              players={players}
            />
          ))}
        </div>
      )}
    </main>
  );
}
