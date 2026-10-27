import { useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTeams } from "../hooks/useTeams";
import { useTeamRoster } from "../hooks/useTeamRoster";
import { API_BASE_URL } from "../services/games";
import type { TeamSummary } from "../types/game";
import { PlayerHeadshot } from "../components/PlayerHeadshot";

function TeamLogo({
  team,
  large = false,
}: {
  team: TeamSummary;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return team.logoUrl && !failed ? (
    <img
      className={large ? "teams-logo-large" : "teams-card-logo"}
      src={`${API_BASE_URL}${team.logoUrl}`}
      alt={`${team.fullName} logo`}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className={large ? "teams-logo-fallback large" : "teams-logo-fallback"}
      aria-label={`${team.abbreviation} logo unavailable`}
    >
      {team.abbreviation}
    </span>
  );
}

function TeamList({
  teams,
  loading,
  error,
  retry,
}: {
  teams: TeamSummary[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  return (
    <main className="teams-page">
      <div className="teams-page-heading">
        <div>
          <p className="eyebrow muted">THE LEAGUE</p>
          <h1>
            NBA Teams<span className="orange">.</span>
          </h1>
          <p>Choose a team to explore its current-season roster.</p>
        </div>
        <span className="teams-count">
          30 <small>TEAMS</small>
        </span>
      </div>
      {loading ? (
        <div
          className="teams-grid"
          aria-label="Loading NBA teams"
          aria-busy="true"
        >
          {Array.from({ length: 12 }, (_, index) => (
            <div className="teams-card-skeleton" key={index}>
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="state-card error-state">
          <div className="state-icon">
            <RefreshCw />
          </div>
          <h3>Couldn’t load the teams</h3>
          <p>{error}</p>
          <button className="primary-button" onClick={retry}>
            Try again <RefreshCw size={15} />
          </button>
        </div>
      ) : (
        <div className="teams-grid" role="list" aria-label="NBA teams">
          {teams.map((team) => (
            <Link
              className="teams-card"
              role="listitem"
              to={`/teams/${team.id}`}
              key={team.id}
              aria-label={`View ${team.fullName} roster`}
            >
              <TeamLogo team={team} />
              <span className="teams-card-name">
                {team.fullName}
                <small>{team.abbreviation}</small>
              </span>
              <ArrowRight
                className="teams-card-arrow"
                size={17}
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function RosterView({
  teamId,
  team,
  teamsLoading,
  teamsError,
  retryTeams,
}: {
  teamId: number;
  team: TeamSummary | undefined;
  teamsLoading: boolean;
  teamsError: string | null;
  retryTeams: () => void;
}) {
  const { data, error, loading, retry } = useTeamRoster(teamId);
  if (teamsLoading || loading)
    return (
      <main className="teams-page">
        <div className="roster-loading" role="status">
          <span className="dropdown-spinner" /> Loading current roster…
        </div>
        <div className="roster-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="roster-skeleton" key={i} />
          ))}
        </div>
      </main>
    );
  if (teamsError)
    return (
      <main className="teams-page">
        <div className="state-card error-state">
          <h3>Couldn’t load team details</h3>
          <p>{teamsError}</p>
          <button className="primary-button" onClick={retryTeams}>
            Try again <RefreshCw size={15} />
          </button>
          <Link className="text-button" to="/teams">
            Back to all teams
          </Link>
        </div>
      </main>
    );
  if (!team)
    return (
      <main className="teams-page">
        <div className="state-card">
          <h3>Team not found</h3>
          <p>Choose a team from the current NBA team list.</p>
          <Link className="text-button" to="/teams">
            <ArrowLeft size={16} /> Back to all teams
          </Link>
        </div>
      </main>
    );
  return (
    <main className="teams-page team-detail-page">
      <Link className="text-button roster-back" to="/teams">
        <ArrowLeft size={16} /> All teams
      </Link>
      <section className="team-detail-heading">
        <TeamLogo team={team} large />
        <div>
          <p className="eyebrow muted">
            CURRENT ROSTER · {data?.season ?? "NBA SEASON"}
          </p>
          <h1>
            {team.fullName}
            <span className="orange">.</span>
          </h1>
          <span className="team-detail-abbr">{team.abbreviation}</span>
        </div>
      </section>
      <div className="roster-section-heading">
        <div>
          <p className="eyebrow muted">THE PLAYERS</p>
          <h2>
            Roster<span className="orange">.</span>
          </h2>
        </div>
        <span>{data?.players.length ?? "—"} PLAYERS</span>
      </div>
      {error ? (
        <div className="state-card error-state">
          <div className="state-icon">
            <RefreshCw />
          </div>
          <h3>Couldn’t load this roster</h3>
          <p>{error}</p>
          <button className="primary-button" onClick={retry}>
            Try again <RefreshCw size={15} />
          </button>
        </div>
      ) : data && data.players.length === 0 ? (
        <div className="state-card">
          <div className="state-icon">
            <Users />
          </div>
          <h3>No roster players returned</h3>
          <p>
            The NBA data provider returned an empty roster for the {data.season}{" "}
            season.
          </p>
        </div>
      ) : (
        data && (
          <div
            className="roster-grid"
            role="list"
            aria-label={`${team.fullName} players`}
          >
            {data.players.map((player) => (
              <article
                className="roster-card"
                role="listitem"
                key={player.playerId}
              >
                <div className="roster-identity">
            <PlayerHeadshot name={player.name} url={player.headshotUrl} />
                  <div className="roster-player-copy">
                    <div className="roster-player-top">
                      <span className="jersey-number">
                        #{player.jerseyNumber || "—"}
                      </span>
                      <span className="player-position">
                        {player.position || "—"}
                      </span>
                    </div>
                    <h3>{player.name || "Player name unavailable"}</h3>
                  </div>
                </div>
                <dl className="player-details">
                  <div>
                    <dt>Height</dt>
                    <dd>{player.height || "—"}</dd>
                  </div>
                  <div>
                    <dt>Weight</dt>
                    <dd>{player.weight ? `${player.weight} lb` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Age</dt>
                    <dd>{player.age || "—"}</dd>
                  </div>
                  <div>
                    <dt>Experience</dt>
                    <dd>{player.experience || "—"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )
      )}
    </main>
  );
}

export function Teams() {
  const { teamId: teamIdParam } = useParams();
  const { data, error, loading, retry } = useTeams(true);
  if (!teamIdParam)
    return (
      <TeamList
        teams={data?.teams ?? []}
        loading={loading}
        error={error}
        retry={retry}
      />
    );
  const parsedId = /^\d+$/.test(teamIdParam) ? Number(teamIdParam) : NaN;
  const team = data?.teams.find((candidate) => candidate.id === parsedId);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0)
    return (
      <main className="teams-page">
        <div className="state-card">
          <h3>Team not found</h3>
          <p>That is not a valid NBA team ID.</p>
          <Link className="text-button" to="/teams">
            <ArrowLeft size={16} /> Back to all teams
          </Link>
        </div>
      </main>
    );
  return (
    <RosterView
      teamId={parsedId}
      team={team}
      teamsLoading={loading}
      teamsError={error}
      retryTeams={retry}
    />
  );
}
