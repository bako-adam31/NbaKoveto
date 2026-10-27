# The Daily Dunk

A responsive NBA scoreboard homepage backed by FastAPI. The frontend never calls NBA.com directly; it fetches a normalized game feed from the local API.

## Stack and data source

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide icons. The small `useGames` hook handles loading, empty, error and retry states without a data-fetching dependency.
- **Backend:** Python 3.12, FastAPI and `nba_api`.
- **Source:** `nba_api`'s `ScoreboardV3` wrapper calls NBA.com's `stats.nba.com` scoreboard for a requested calendar date. Its nested response includes game status, explicit home/away teams, scores and UTC start timestamps. Team names and IDs come from the library's bundled NBA-only static team reference. The backend translates this into a stable JSON format and caches per date. Team logos are fetched through a restricted backend route, so the browser never contacts NBA.com.

The project uses Python because the existing backend already uses FastAPI and `nba_api`; keeping the integration there avoids another service. ScoreboardV3 is preferred because it is the documented newer format and supplies UTC game times plus explicit team sides. `nba_api` warns that stats.nba.com throttles bursts and can time out or refuse cloud IP ranges. It is an unofficial NBA.com interface and can change or block requests. The API uses a 12 second default timeout, spaces upstream calls, caches each scoreboard date for 45 seconds and returns clear 502 errors instead of inventing scores. Live is reported only when NBA's status says the game is in progress. Team logos use the official NBA CDN through a backend proxy and show an abbreviation fallback if unavailable.

## Architecture

- `client/src/pages` contains the homepage, NBA player leaderboards, interactive teams and roster views, and a reusable coming-soon page.
- `client/src/components` contains the site header, game card, and shared player headshot component.
- `client/src/hooks` and `client/src/services` own frontend fetching and state.
- `client/src/components/NavDropdown.tsx` renders the lazy-loaded games and teams navigation panels.
- `server/src/main.py` configures FastAPI, CORS, date validation and routes.
- `server/src/services/nba.py` owns the ScoreboardV3 and logo upstream requests, normalization, date-window timezone conversion, caches and error mapping. The team list comes from `nba_api.stats.static.teams.get_teams()` and is cached in process.
- Team rosters use `nba_api.stats.endpoints.commonteamroster.CommonTeamRoster` from the same backend service. The service passes the selected numeric NBA team ID and dynamically computed current NBA season, normalizes the `CommonTeamRoster` dataset, and caches each team-season response for one hour. Headshot URLs are formed from each returned `PLAYER_ID` using the NBA CDN's `260x190` image path; the browser loads those public images directly and shows initials if an image is unavailable.
- Player leaderboards use one league-wide `LeagueDashPlayerStats` request with `PerMode=PerGame` and `SeasonType=Regular Season`. One cached normalized response feeds Points, Three-Pointers Made, Assists, Rebounds, Steals, and Blocks. The browser sorts each list independently and expands only the selected card from three to ten rows.
- No database is configured yet; API service boundaries leave room for PostgreSQL-backed persistence later.

## Prerequisites

- Node.js 20+ and npm 10+
- Python 3.10+

## Install and configure

From the repository root:

```sh
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `.env` values as needed. `CORS_ORIGINS` is a comma-separated allowlist; `CORS_ORIGIN_REGEX` permits local development hosts with Vite's alternate port if the default port is occupied. `UPSTREAM_TIMEOUT_SECONDS`, `UPSTREAM_MIN_INTERVAL_SECONDS`, `CACHE_TTL_SECONDS`, and `PLAYER_STATS_CACHE_TTL_SECONDS` tune upstream behavior. The browser only needs `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`). No credentials are required or exposed.

## Start

```sh
npm run dev
```

- Homepage: http://127.0.0.1:5173
- API health: http://127.0.0.1:8000/api/health
- Today's games (Eastern calendar date by default): http://127.0.0.1:8000/api/games
- Explicit date: http://127.0.0.1:8000/api/games?date=2026-10-27
- Upcoming local-date window: http://127.0.0.1:8000/api/games/window?start_date=2026-10-27&days=3&timezone=Europe%2FBucharest
- Current NBA teams: http://127.0.0.1:8000/api/teams
- Current-season team roster (example: Boston Celtics): http://127.0.0.1:8000/api/teams/1610612738/roster
- Current-season player stats: http://127.0.0.1:8000/api/players/leaders

Production frontend build:

```sh
npm run build
```

## API

The full `/games` page shares the Games dropdown's `GET /api/games/window` request and local date range. Completed games link by their 10-digit NBA game ID to `/games/{game_id}`. That endpoint uses `BoxScoreSummaryV3` for final status, score, arena, and period scoring and `BoxScoreTraditionalV3` for player statistics. It rejects non-final games, caches completed details for one day, and returns final summary data even when the traditional player box score is temporarily unavailable. Player rows preserve the provider's DNP comments and include inactive players when the summary response lists them. The frontend reuses the site's NBA CDN player headshot helper and backend team-logo proxy.

`GET /api/games?date=YYYY-MM-DD` returns one NBA-source date. `date` is optional (defaults to the current date in `America/New_York`) and invalid dates return HTTP 422. `GET /api/games/window?start_date=YYYY-MM-DD&days=3&timezone=IANA_ZONE` returns games whose actual UTC start times fall within the requested three local calendar days. It queries adjacent NBA scoreboard dates to cover timezone crossings, removes duplicate game IDs and sorts by actual start time. The navigation uses this endpoint for Today, Tomorrow, and the following weekday/date. Each game contains status, UTC/local timestamps, home/away team details and nullable scores. Scheduled scores remain null. `GET /api/teams` returns the 30 NBA teams from `get_teams()`, sorted case-insensitively by full name with IDs, nicknames, cities, abbreviations and backend logo paths. `GET /api/teams/{team_id}/roster` returns the team identity, season label and normalized player roster. The season defaults dynamically using the NBA season year boundary (October, in `America/New_York`); an optional `season=YYYY-YY` can request a valid NBA season format. Player rows preserve `PLAYER_ID` and include a headshot URL formed as `https://cdn.nba.com/headshots/nba/latest/260x190/{PLAYER_ID}.png`; the browser loads these images directly. Rows also normalize name, number, position, height, weight, age and experience; unavailable optional values are null. Successful roster data is cached for one hour. `GET /api/health` reports API status. `GET /api/logos/{team_id}` serves the official NBA CDN SVG through a restricted backend route for known NBA team IDs and sets a one-day client cache header. Upstream failures return HTTP 502 and an actionable detail string.
`GET /api/games?date=YYYY-MM-DD` returns one NBA-source date. `date` is optional (defaults to the current date in `America/New_York`) and invalid dates return HTTP 422. `GET /api/games/window?start_date=YYYY-MM-DD&days=3&timezone=IANA_ZONE` returns games whose actual UTC start times fall within the requested three local calendar days. It queries adjacent NBA scoreboard dates to cover timezone crossings, removes duplicate game IDs and sorts by actual start time. The navigation uses this endpoint for Today, Tomorrow, and the following weekday/date. Each game contains status, UTC/local timestamps, home/away team details and nullable scores. Scheduled scores remain null. `GET /api/teams` returns the 30 NBA teams from `get_teams()`, sorted case-insensitively by full name with IDs, nicknames, cities, abbreviations and backend logo paths. `GET /api/teams/{team_id}/roster` returns the team identity, season label and normalized player roster. The season defaults dynamically using the NBA season year boundary (October, in `America/New_York`); an optional `season=YYYY-YY` can request a valid NBA season format. Player rows preserve `PLAYER_ID` and include a headshot URL formed as `https://cdn.nba.com/headshots/nba/latest/260x190/{PLAYER_ID}.png`; the browser loads these images directly. Rows also normalize name, number, position, height, weight, age and experience; unavailable optional values are null. Successful roster data is cached for one hour. `GET /api/players/leaders?season=YYYY-YY` returns normalized league-wide player data, using `LeagueDashPlayerStats` for NBA regular-season PerGame stats and the dynamically selected current season when omitted. Each player includes ID, name, available current team ID/abbreviation/name and backend logo path, official CDN headshot URL, games played, and the PTS, FG3M, AST, REB, STL, and BLK per-game values. Trade split rows are deduplicated by player ID and weighted by games when the source provides team splits without an aggregate row; a team logo is omitted when the response does not identify a single team. Successful stats are cached for five minutes by default (`PLAYER_STATS_CACHE_TTL_SECONDS`). `GET /api/health` reports API status. `GET /api/logos/{team_id}` serves the official NBA CDN SVG through a restricted backend route for known NBA team IDs and sets a one-day client cache header. Upstream failures return HTTP 502 and an actionable detail string.

## Limitations and troubleshooting

- NBA.com does not publish this interface as a supported public API. Endpoints or response fields can change, requests can be throttled, and some hosting providers' IP ranges may be blocked. A cached successful scoreboard date is reused for 45 seconds by default; the static team list is cached for the lifetime of the process, and the browser caches dropdown results briefly.
- The source can be delayed or unavailable. An empty schedule means the endpoint returned no games; it is not a substitute for a league calendar.
- `CommonTeamRoster` is also an unofficial stats.nba.com endpoint and may be throttled, blocked, or return no roster early in a season. In those cases the team identity remains available, and the roster view offers a retry instead of substitute players.
- `LeagueDashPlayerStats` depends on the same unofficial stats.nba.com service and can be blocked, delayed, or unavailable. The Players page surfaces the backend error and retry action rather than substituting sample leaders.
- Scores remain null until the upstream line score contains them. No score, live state, or statistical result is fabricated.
- If the scoreboard reports an upstream error, retry after a short pause. If it consistently times out or returns blocked, check the FastAPI terminal log and try another network/hosting egress; do not increase request frequency.
- If the browser reports a CORS error, add the exact frontend origin to `CORS_ORIGINS` and restart the API. If the API is unreachable, confirm it is listening on port 8000 and that `VITE_API_BASE_URL` matches.
- Player profile pages, standings, and play-by-play remain later milestones. Individual players in roster and game box scores are not linked to profile pages.
