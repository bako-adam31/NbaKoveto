import logging
import math
import os
import re
import threading
import time
from functools import lru_cache
from datetime import date, datetime
from zoneinfo import ZoneInfo

import requests
from nba_api.stats.endpoints import commonteamroster, leaguedashplayerstats, scoreboardv3
from nba_api.stats.static import teams as nba_teams

logger = logging.getLogger(__name__)
_EASTERN = ZoneInfo("America/New_York")
_cache: dict[str, tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()
_upstream_lock = threading.Lock()
_last_upstream_request = 0.0
_roster_cache: dict[tuple[int, str], tuple[float, list[dict]]] = {}
_ROSTER_CACHE_TTL_SECONDS = 60 * 60
_player_stats_cache: dict[str, tuple[float, list[dict]]] = {}
_PLAYER_STATS_CACHE_TTL_SECONDS = 5 * 60

class UpstreamError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _team_catalog() -> dict[int, dict]:
    return {int(t["id"]): t for t in nba_teams.get_teams()}


@lru_cache(maxsize=1)
def get_nba_teams() -> list[dict]:
    """Return the library's bundled NBA-only team list in display order."""
    return [
        {
            "id": int(team["id"]),
            "fullName": team["full_name"],
            "nickname": team["nickname"],
            "city": team["city"],
            "abbreviation": team["abbreviation"],
            "logoUrl": f"/api/logos/{team['id']}",
        }
        for team in sorted(nba_teams.get_teams(), key=lambda row: row["full_name"].casefold())
    ]


def current_nba_season(today: date | None = None) -> str:
    """Return the NBA season label, which changes at the start of October."""
    today = today or datetime.now(ZoneInfo("America/New_York")).date()
    start_year = today.year if today.month >= 10 else today.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def fetch_team_roster(team_id: int, season: str, timeout: int = 12) -> list[dict]:
    """Fetch and normalize one team's CommonTeamRoster response."""
    global _last_upstream_request
    valid_team_ids = {int(team["id"]) for team in nba_teams.get_teams()}
    if team_id not in valid_team_ids:
        raise UpstreamError("Unknown NBA team.", 404)
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)

    key = (team_id, season)
    now = time.monotonic()
    with _cache_lock:
        cached = _roster_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

    try:
        with _upstream_lock:
            with _cache_lock:
                cached = _roster_cache.get(key)
                if cached and cached[0] > time.monotonic():
                    return cached[1]
            min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
            wait_for = min_gap - (time.monotonic() - _last_upstream_request)
            if wait_for > 0:
                time.sleep(wait_for)
            _last_upstream_request = time.monotonic()
            endpoint = commonteamroster.CommonTeamRoster(
                team_id=team_id, season=season, timeout=timeout
            )
            dataset = endpoint.common_team_roster.get_dict()
    except Exception as exc:
        logger.warning("NBA roster request failed for team %s, season %s: %s", team_id, season, exc)
        message = "The NBA data provider could not load this roster. Please try again shortly."
        if "403" in str(exc) or "forbidden" in str(exc).lower():
            message = "The NBA data provider blocked this roster request. Please try again later."
        elif "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            message = "The NBA data provider took too long to load this roster. Please try again."
        raise UpstreamError(message) from exc

    try:
        headers = dataset["headers"]
        rows = dataset["data"]
        required = {"PLAYER", "PLAYER_ID", "NUM", "POSITION", "HEIGHT", "WEIGHT", "AGE", "EXP"}
        if not isinstance(headers, list) or not required.issubset(headers) or not isinstance(rows, list):
            raise ValueError("CommonTeamRoster payload did not contain expected player fields")
        players = []
        for row in rows:
            values = dict(zip(headers, row))
            player_id = int(values["PLAYER_ID"])
            players.append({
                "playerId": player_id,
                "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
                "name": _optional_text(values.get("PLAYER")),
                "jerseyNumber": _optional_text(values.get("NUM")),
                "position": _optional_text(values.get("POSITION")),
                "height": _optional_text(values.get("HEIGHT")),
                "weight": _optional_text(values.get("WEIGHT")),
                "age": _optional_text(values.get("AGE")),
                "experience": _optional_text(values.get("EXP")),
            })
    except (KeyError, TypeError, ValueError) as exc:
        logger.warning("Unexpected NBA roster payload for team %s, season %s: %s", team_id, season, exc)
        raise UpstreamError("The NBA data provider returned an unexpected roster response.") from exc

    with _cache_lock:
        _roster_cache[key] = (time.monotonic() + _ROSTER_CACHE_TTL_SECONDS, players)
    return players


def _optional_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text and text.upper() not in {"N/A", "NONE", "NULL"} else None


def fetch_player_leaders(season: str, timeout: int = 12) -> list[dict]:
    """Fetch one shared league-wide per-game dataset for all player leaderboards."""
    global _last_upstream_request
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)

    now = time.monotonic()
    with _cache_lock:
        cached = _player_stats_cache.get(season)
        if cached and cached[0] > now:
            return cached[1]

    try:
        with _upstream_lock:
            with _cache_lock:
                cached = _player_stats_cache.get(season)
                if cached and cached[0] > time.monotonic():
                    return cached[1]
            min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
            wait_for = min_gap - (time.monotonic() - _last_upstream_request)
            if wait_for > 0:
                time.sleep(wait_for)
            _last_upstream_request = time.monotonic()
            endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                season_type_all_star="Regular Season",
                per_mode_detailed="PerGame",
                measure_type_detailed_defense="Base",
                league_id_nullable="00",
                timeout=timeout,
            )
            dataset = endpoint.league_dash_player_stats.get_dict()
    except Exception as exc:
        logger.warning("NBA player stats request failed for season %s: %s", season, exc)
        message = "The NBA data provider could not load player statistics. Please try again shortly."
        if "403" in str(exc) or "forbidden" in str(exc).lower():
            message = "The NBA data provider blocked this statistics request. Please try again later."
        elif "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            message = "The NBA data provider took too long to load player statistics. Please try again."
        raise UpstreamError(message) from exc

    try:
        players = _normalize_player_stats(dataset, _team_catalog())
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        logger.warning("Unexpected NBA player stats payload for season %s: %s", season, exc)
        raise UpstreamError("The NBA data provider returned an unexpected player stats response.") from exc

    ttl = max(1, int(os.getenv("PLAYER_STATS_CACHE_TTL_SECONDS", str(_PLAYER_STATS_CACHE_TTL_SECONDS))))
    with _cache_lock:
        _player_stats_cache[season] = (time.monotonic() + ttl, players)
    return players


_PLAYER_STAT_FIELDS = {
    "PTS": "pointsPerGame",
    "FG3M": "threePointersMadePerGame",
    "AST": "assistsPerGame",
    "REB": "reboundsPerGame",
    "STL": "stealsPerGame",
    "BLK": "blocksPerGame",
}


def _normalize_player_stats(dataset: dict, catalog: dict[int, dict]) -> list[dict]:
    headers, rows = dataset["headers"], dataset["data"]
    required = {"PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GP", *_PLAYER_STAT_FIELDS}
    if not isinstance(headers, list) or not required.issubset(headers) or not isinstance(rows, list):
        raise ValueError("LeagueDashPlayerStats payload did not contain expected fields")

    grouped: dict[int, list[dict]] = {}
    for raw in rows:
        values = dict(zip(headers, raw))
        player_id = int(values["PLAYER_ID"])
        name = _optional_text(values.get("PLAYER_NAME"))
        games = _number(values.get("GP"))
        if player_id <= 0 or not name or games is None or games <= 0:
            continue
        raw_team_id = _number(values.get("TEAM_ID"))
        team_id = int(raw_team_id) if raw_team_id is not None else 0
        abbreviation = _optional_text(values.get("TEAM_ABBREVIATION"))
        stats = {key: _number(values.get(key)) for key in _PLAYER_STAT_FIELDS}
        grouped.setdefault(player_id, []).append({
            "playerId": player_id,
            "name": name,
            "gamesPlayed": games,
            "teamId": team_id,
            "teamAbbreviation": abbreviation,
            "stats": stats,
        })

    normalized = []
    for player_id, entries in grouped.items():
        # A TOT row is the provider's league-wide combined figure for a traded
        # player. Otherwise weight split team rows by games, and avoid claiming
        # one of several teams is the player's current team.
        aggregate = next((row for row in entries if row["teamAbbreviation"] == "TOT" or row["teamId"] == 0), None)
        team_rows: dict[int, dict] = {}
        for row in entries:
            if row["teamId"] in catalog:
                current = team_rows.get(row["teamId"])
                if current is None or row["gamesPlayed"] > current["gamesPlayed"]:
                    team_rows[row["teamId"]] = row

        if aggregate:
            stats = aggregate["stats"]
            games = aggregate["gamesPlayed"]
        elif len(team_rows) > 1:
            games = sum(row["gamesPlayed"] for row in team_rows.values())
            stats = {
                field: (
                    sum(row["stats"][field] * row["gamesPlayed"] for row in team_rows.values() if row["stats"][field] is not None)
                    / sum(row["gamesPlayed"] for row in team_rows.values() if row["stats"][field] is not None)
                    if any(row["stats"][field] is not None for row in team_rows.values()) else None
                )
                for field in _PLAYER_STAT_FIELDS
            }
        else:
            selected = max(entries, key=lambda row: (row["gamesPlayed"], row["teamAbbreviation"] or ""))
            stats = selected["stats"]
            games = selected["gamesPlayed"]

        team_id = next(iter(team_rows)) if len(team_rows) == 1 else None
        team = catalog.get(team_id) if team_id is not None else None
        normalized.append({
            "playerId": player_id,
            "name": entries[0]["name"],
            "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
            "teamId": team_id,
            "teamAbbreviation": team.get("abbreviation") if team else None,
            "teamName": team.get("full_name") if team else None,
            "teamLogoUrl": f"/api/logos/{team_id}" if team else None,
            "gamesPlayed": games,
            **{_PLAYER_STAT_FIELDS[field]: value for field, value in stats.items()},
        })
    return normalized


def _number(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def fetch_team_logo(team_id: int, timeout: int = 5) -> tuple[bytes, str]:
    if team_id not in _team_catalog():
        raise UpstreamError("Unknown team.", 404)
    url = f"https://cdn.nba.com/logos/nba/{team_id}/global/L/logo.svg"
    try:
        response = requests.get(url, timeout=timeout, headers={"User-Agent": "TheDailyDunk/1.0"})
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.info("NBA team logo unavailable for %s: %s", team_id, exc)
        raise UpstreamError("The team logo is temporarily unavailable.", 502) from exc
    content_type = response.headers.get("Content-Type", "image/svg+xml").split(";", 1)[0]
    if content_type not in {"image/svg+xml", "image/png"}:
        raise UpstreamError("The NBA logo service returned an unexpected image type.", 502)
    return response.content, content_type


def fetch_games(day: date, timeout: int, ttl: int) -> list[dict]:
    global _last_upstream_request
    key = day.isoformat()
    now = time.monotonic()
    with _cache_lock:
        item = _cache.get(key)
        if item and item[0] > now:
            return item[1]

    try:
        # ScoreboardV2 is an upstream stats endpoint; serialize calls to avoid bursts.
        with _upstream_lock:
            min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
            wait_for = min_gap - (time.monotonic() - _last_upstream_request)
            if wait_for > 0:
                time.sleep(wait_for)
            _last_upstream_request = time.monotonic()
            response = scoreboardv3.ScoreboardV3(
                game_date=key, league_id="00", timeout=timeout
            )
            payload = response.get_dict()
    except Exception as exc:
        logger.exception("NBA scoreboard request failed for %s", key)
        message = "The NBA data provider could not be reached. Please try again shortly."
        if "403" in str(exc) or "forbidden" in str(exc).lower():
            message = "The NBA data provider blocked this request. Please try again later."
        elif "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            message = "The NBA data provider took too long to respond. Please try again."
        raise UpstreamError(message) from exc

    try:
        upstream_games = payload["scoreboard"]["games"]
        games = _normalize_v3(upstream_games, _team_catalog(), day)
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        logger.exception("Unexpected NBA scoreboard payload for %s", key)
        raise UpstreamError("The NBA data provider returned an unexpected response.") from exc

    with _cache_lock:
        _cache[key] = (time.monotonic() + ttl, games)
    return games


def fetch_games_window(
    start_day: date, days: int, timezone: ZoneInfo, timeout: int, ttl: int
) -> list[dict]:
    """Fetch enough adjacent NBA dates to cover a local-calendar window."""
    end_day = start_day.fromordinal(start_day.toordinal() + days - 1)
    source_start = start_day.fromordinal(start_day.toordinal() - 1)
    source_end = end_day.fromordinal(end_day.toordinal() + 1)
    by_id: dict[str, dict] = {}
    source_day = source_start
    while source_day <= source_end:
        for game in fetch_games(source_day, timeout, ttl):
            game_id = game["id"]
            if game_id in by_id:
                continue
            local_start = None
            if game["startsAt"]:
                local_start = datetime.fromisoformat(game["startsAt"]).astimezone(timezone)
                local_date = local_start.date()
            else:
                local_date = date.fromisoformat(game["date"])
            if start_day <= local_date <= end_day:
                localized = dict(game)
                localized["localDate"] = local_date.isoformat()
                localized["localStartsAt"] = local_start.isoformat() if local_start else None
                by_id[game_id] = localized
        source_day = source_day.fromordinal(source_day.toordinal() + 1)

    return sorted(
        by_id.values(),
        key=lambda game: (
            datetime.fromisoformat(game["startsAt"]).astimezone(ZoneInfo("UTC"))
            if game["startsAt"]
            else datetime.max.replace(tzinfo=ZoneInfo("UTC"))
        ),
    )


def _normalize_v3(upstream_games: list[dict], catalog: dict[int, dict], requested_day: date) -> list[dict]:
    result = []
    seen_ids: set[str] = set()
    for game in upstream_games:
        # V3 uses camelCase field names in its nested response.
        game_id = str(game.get("gameId") or "")
        if not game_id:
            raise ValueError("ScoreboardV3 game has no gameId")
        if game_id in seen_ids:
            continue
        seen_ids.add(game_id)
        home = game.get("homeTeam") or {}
        away = game.get("awayTeam") or {}
        home_id, away_id = int(home["teamId"]), int(away["teamId"])
        home_info, away_info = catalog.get(home_id, {}), catalog.get(away_id, {})
        status_id_value = game.get("gameStatus")
        status_id = int(status_id_value) if status_id_value is not None else None
        status_text = str(game.get("gameStatusText") or "Status unavailable")
        status = {1: "scheduled", 2: "live", 3: "final"}.get(status_id, "unknown")

        def side(team_id: int, team_data: dict, info: dict) -> dict:
            score_value = team_data.get("score")
            score = int(score_value) if score_value is not None and status != "scheduled" else None
            return {
                "id": team_id,
                "name": info.get("full_name") or " ".join(filter(None, [team_data.get("teamCity"), team_data.get("teamName")])) or "Unknown team",
                "abbreviation": info.get("abbreviation") or team_data.get("teamTricode") or "",
                "city": info.get("city") or team_data.get("teamCity") or "",
                "logoUrl": f"/api/logos/{team_id}" if info else None,
                "score": score,
            }

        starts_at = game.get("gameTimeUTC") or None
        if starts_at:
            starts_at = datetime.fromisoformat(str(starts_at).replace("Z", "+00:00")).isoformat()
        result.append({
            "id": game_id,
            "date": requested_day.isoformat(),
            "startsAt": starts_at,
            "status": status,
            "statusText": status_text,
            "period": int(game.get("period") or 0),
            "clock": game.get("gameClock") or None,
            "homeTeam": side(home_id, home, home_info),
            "awayTeam": side(away_id, away, away_info),
        })
    return result
