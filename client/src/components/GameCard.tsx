import { Clock3 } from "lucide-react";
import type { Game, Team } from "../types/game";
import { API_BASE_URL } from "../services/games";
function TeamRow({ team, winner }: { team: Team; winner: boolean }) {
  return (
    <div className={`team-row ${winner ? "winner" : ""}`}>
      <div className="team-ident">
        {team.logoUrl && (
          <img
            src={`${API_BASE_URL}${team.logoUrl}`}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <span>{team.name}</span>
        <small>{team.abbreviation}</small>
      </div>
      <strong className="score">{team.score ?? "—"}</strong>
    </div>
  );
}
export function GameCard({ game }: { game: Game }) {
  const statusLabel =
    game.status === "live"
      ? `LIVE${game.period ? ` · ${game.period === 1 ? "1ST" : game.period === 2 ? "2ND" : game.period === 3 ? "3RD" : "4TH"}` : ""}`
      : game.status === "final"
        ? "FINAL"
        : game.status === "scheduled"
          ? "UPCOMING"
          : game.statusText || "STATUS UNAVAILABLE";
  const time = game.startsAt
    ? new Date(game.startsAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;
  return (
    <article className={`game-card ${game.status}`}>
      <div className="game-meta">
        <span className={`status-dot ${game.status}`}>{statusLabel}</span>
        <span>
          {game.status === "scheduled" && time ? (
            <>
              <Clock3 size={13} />
              {time} ET
            </>
          ) : (
            game.statusText
          )}
        </span>
      </div>
      <div className="teams">
        <TeamRow
          team={game.awayTeam}
          winner={
            game.status === "final" &&
            (game.awayTeam.score ?? 0) > (game.homeTeam.score ?? 0)
          }
        />
        <TeamRow
          team={game.homeTeam}
          winner={
            game.status === "final" &&
            (game.homeTeam.score ?? 0) > (game.awayTeam.score ?? 0)
          }
        />
      </div>
      <div className="card-foot">
        <span>
          {game.awayTeam.city} at {game.homeTeam.city}
        </span>
        {game.status === "live" && game.clock && <span>{game.clock}</span>}
      </div>
    </article>
  );
}
