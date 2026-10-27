import { useMemo, useState } from "react";
import nbaLogo from "../assets/nbaLogo.png";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { useGames } from "../hooks/useGames";
import { GameCard } from "../components/GameCard";

function localDate(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function Home() {
  const today = useMemo(() => localDate(new Date()), []);
  const [day, setDay] = useState(today);
  const { data, error, loading, retry } = useGames(day);
  const label = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const move = (n: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + n);
    setDay(localDate(d));
  };
  return (
    <main className="min-h-screen">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> THE NBA, AT A GLANCE
          </p>
          <h1>
            The Daily
            <br />
            <em>Dunk.</em>
          </h1>
          <p className="hero-sub">
            Your daily destination for NBA scores, stats, and everything
            basketball.
          </p>
          <a className="hero-cta" href="#games">
            Catch today’s action <ArrowDown size={16} />
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <svg
            className="basketball-svg"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <clipPath id="ball-clip">
                <circle cx="100" cy="100" r="85" />
              </clipPath>
            </defs>

            {/* Black badge background + white outer ring */}
            <circle
              cx="100"
              cy="100"
              r="96"
              fill="#0D0E15"
              stroke="#F2F2F2"
              strokeWidth="5"
            />

            {/* Orange ball */}
            <circle cx="100" cy="100" r="85" fill="#E2692F" />

            {/* Seams, clipped to the ball */}
            <g
              clipPath="url(#ball-clip)"
              stroke="#0D0E15"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Long diagonal seam */}
              <path d="M 0 88 C 60 78, 140 108, 200 165" />
              {/* Left vertical S-curve */}
              <path d="M 80 8 C 48 68, 52 140, 112 200" />
              {/* Top "smile" seam */}
              <path d="M 48 40 C 82 58, 135 48, 190 62" />
              {/* Lower-left seam */}
              <path d="M 0 122 C 30 102, 58 124, 86 190" />
            </g>

            {/* Ball outline on top of the seams */}
            <circle cx="100" cy="100" r="85" stroke="#0D0E15" strokeWidth="6" />
          </svg>

          <span className="art-note">
            82 GAMES
            <br />
            ONE LEAGUE
          </span>
        </div>
        <div className="hero-index">
          01 <span>/</span> 04
        </div>
      </section>
      <section className="games-section" id="games">
        <div className="section-top">
          <div className="section-title-wrap">
            <div>
  <p className="eyebrow muted">THE SCOREBOARD</p>
  <h2 className="title-with-logo">
    <img
      className="nba-logo-inline"
      src={nbaLogo}
      alt="NBA logo"
    />
    Games<span className="orange">.</span>
  </h2>
</div>
</div>
          <div className="date-control">
            <button onClick={() => move(-1)} aria-label="Previous day">
              <ArrowLeft size={17} />
            </button>
            <span>
              <CalendarDays size={16} />
              {label}
            </span>
            <button onClick={() => move(1)} aria-label="Next day">
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="scoreboard-caption">
          <span>{data?.games.length ?? "—"} MATCHUPS</span>
          <span>ALL TIMES EASTERN</span>
        </div>
        {loading ? (
          <div className="game-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="skeleton" key={i}>
                <i />
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
            <h3>Couldn’t reach the scoreboard</h3>
            <p>{error}</p>
            <button className="primary-button" onClick={retry}>
              Try again <RefreshCw size={15} />
            </button>
          </div>
        ) : !data?.games.length ? (
          <div className="state-card">
            <div className="state-icon">
              <Trophy />
            </div>
            <h3>No games on the board</h3>
            <p>
              There are no NBA games scheduled for {label}. Check another date
              for the next tip-off.
            </p>
            <button className="text-button" onClick={() => setDay(today)}>
              Back to today <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div className="game-grid">
            {data.games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}
        <div className="section-bottom">
          <span>Scores and schedules provided by NBA.com</span>
          <span>MORE OF THE GAME, COMING SOON</span>
        </div>
      </section>
      <footer>
        <div className="footer-brand">
          THE DAILY <b>DUNK</b>
        </div>
        <span>Made for the love of the game.</span>
        <span>© {new Date().getFullYear()} The Daily Dunk</span>
      </footer>
    </main>
  );
}
