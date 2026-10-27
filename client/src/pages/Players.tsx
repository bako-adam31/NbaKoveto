import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Users } from "lucide-react";
import { PlayerHeadshot } from "../components/PlayerHeadshot";
import { usePlayerLeaders } from "../hooks/usePlayerLeaders";
import { API_BASE_URL } from "../services/games";
import type { PlayerStatsRow } from "../types/game";

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
  const [failed, setFailed] = useState(false);
  if (!player.teamLogoUrl || failed)
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
  return (
    <img
      className="leader-team-logo"
      src={`${API_BASE_URL}${player.teamLogoUrl}`}
      alt={`${player.teamName || player.teamAbbreviation || "NBA team"} logo`}
      onError={() => setFailed(true)}
    />
  );
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
