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
from nba_api.stats.endpoints import (
    boxscoretraditionalv3,
    boxscoresummaryv3,
    commonteamroster,
    commonallplayers,
    commonplayerinfo,
    leaguedashplayerstats,
    leaguedashteamstats,
    leaguestandingsv3,
    playercareerstats,
    scoreboardv3,
)
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
_team_stats_cache: dict[str, tuple[float, dict]] = {}
_TEAM_STATS_CACHE_TTL_SECONDS = 10 * 60
_standings_cache: dict[str, tuple[float, dict]] = {}
_STANDINGS_CACHE_TTL_SECONDS = 60
_player_search_cache: dict[str, tuple[float, list[dict]]] = {}
_PLAYER_SEARCH_CACHE_TTL_SECONDS = 30 * 60
_player_profile_cache: dict[tuple[int, str], tuple[float, dict]] = {}
_PLAYER_PROFILE_CACHE_TTL_SECONDS = 30 * 60
_game_detail_cache: dict[str, tuple[float, dict]] = {}
_boxscore_cache: dict[str, tuple[float, dict]] = {}
_GAME_DETAIL_CACHE_TTL_SECONDS = 24 * 60 * 60

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


def _nba_request(factory):
    """Serialize NBA Stats API requests and apply the configured inter-request gap."""
    global _last_upstream_request
    with _upstream_lock:
        min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
        wait_for = min_gap - (time.monotonic() - _last_upstream_request)
        if wait_for > 0:
            time.sleep(wait_for)
        _last_upstream_request = time.monotonic()
        return factory()


def fetch_player_search(query: str, season: str, timeout: int = 12) -> list[dict]:
    """Search one cached active-player catalog, matched case-insensitively by name."""
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)
    needle = query.strip().casefold()
    if len(needle) < 2:
        return []
    now = time.monotonic()
    with _cache_lock:
        cached = _player_search_cache.get(season)
    if not cached or cached[0] <= now:
        try:
            endpoint = _nba_request(lambda: commonallplayers.CommonAllPlayers(
                is_only_current_season=1, league_id="00", season=season, timeout=timeout
            ))
            rows = _dataset_rows(endpoint.common_all_players)
            catalog = _team_catalog()
            players = []
            for row in rows:
                player_id = _int_or_none(row.get("PERSON_ID"))
                name = _optional_text(row.get("DISPLAY_FIRST_LAST"))
                if not player_id or not name:
                    continue
                team_id = _int_or_none(row.get("TEAM_ID"))
                team = catalog.get(team_id) if team_id else None
                players.append({
                    "playerId": player_id,
                    "name": name,
                    "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
                    "teamId": team_id if team else None,
                    "teamName": team["full_name"] if team else _optional_text(row.get("TEAM_NAME")),
                    "teamAbbreviation": team["abbreviation"] if team else _optional_text(row.get("TEAM_ABBREVIATION")),
                    "teamLogoUrl": f"/api/logos/{team_id}" if team else None,
                })
        except Exception as exc:
            logger.warning("NBA active-player catalog request failed for season %s: %s", season, exc)
            raise _player_upstream_error(exc, "player search") from exc
        with _cache_lock:
            _player_search_cache[season] = (time.monotonic() + _PLAYER_SEARCH_CACHE_TTL_SECONDS, players)
    else:
        players = cached[1]
    matches = [player for player in players if needle in player["name"].casefold()]
    matches.sort(key=lambda player: (player["name"].casefold(), player["playerId"]))
    return matches[:12]


def fetch_player_profile(player_id: int, season: str, timeout: int = 12) -> dict:
    """Fetch NBA player bio and career/season statistics using the official IDs."""
    if player_id <= 0:
        raise UpstreamError("playerId must be a positive NBA player ID.", 422)
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)
    key = (player_id, season)
    with _cache_lock:
        cached = _player_profile_cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
    try:
        info = _nba_request(lambda: commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=timeout))
        career = _nba_request(lambda: playercareerstats.PlayerCareerStats(player_id=player_id, per_mode36="Totals", timeout=timeout))
        bio_rows = _dataset_rows(info.common_player_info)
        if not bio_rows or int(bio_rows[0].get("PERSON_ID") or 0) != player_id:
            raise UpstreamError("The NBA data provider could not find this player.", 404)
        bio = bio_rows[0]
        catalog = _team_catalog()
        team_id = _int_or_none(bio.get("TEAM_ID"))
        team = catalog.get(team_id) if team_id else None
        season_rows = _dataset_rows(career.season_totals_regular_season)
        career_rows = _dataset_rows(career.career_totals_regular_season)
        # Season IDs from PlayerCareerStats use the same YYYY-YY label as the API input.
        selected = next((row for row in season_rows if str(row.get("SEASON_ID") or "") == season), None)
        current = _normalize_player_stat_line(selected) if selected else None
        career_total = _normalize_player_stat_line(career_rows[-1]) if career_rows else None
        seasons = []
        for row in season_rows:
            label = _optional_text(row.get("SEASON_ID"))
            stats = _normalize_player_stat_line(row)
            if label and stats:
                seasons.append({"season": label, **stats})
        result = {
            "playerId": player_id,
            "name": _optional_text(bio.get("DISPLAY_FIRST_LAST")) or _optional_text(bio.get("PLAYER_NAME")) or "Unknown player",
            "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
            "team": ({"id": team_id, "name": team["full_name"], "abbreviation": team["abbreviation"], "logoUrl": f"/api/logos/{team_id}"} if team else None),
            "jerseyNumber": _optional_text(bio.get("JERSEY")),
            "position": _optional_text(bio.get("POSITION")),
            "height": _optional_text(bio.get("HEIGHT")),
            "weight": _optional_text(bio.get("WEIGHT")),
            "age": _age_from_birthdate(bio.get("BIRTHDATE")),
            "nationality": _optional_text(bio.get("COUNTRY")),
            "draft": {"year": _optional_text(bio.get("DRAFT_YEAR")), "round": _optional_text(bio.get("DRAFT_ROUND")), "number": _optional_text(bio.get("DRAFT_NUMBER"))},
            "season": season,
            "currentSeasonStats": current,
            "careerStats": career_total,
            "seasonStats": seasons,
        }
    except UpstreamError:
        raise
    except Exception as exc:
        logger.warning("NBA player profile request failed for player %s: %s", player_id, exc)
        raise _player_upstream_error(exc, "player profile") from exc
    if result["name"] == "Unknown player":
        raise UpstreamError("The NBA data provider returned incomplete player information.", 502)
    with _cache_lock:
        _player_profile_cache[key] = (time.monotonic() + _PLAYER_PROFILE_CACHE_TTL_SECONDS, result)
    return result


def _normalize_player_stat_line(row: dict | None) -> dict | None:
    if row is None:
        return None
    minutes = _number(row.get("MIN"))
    return {
        "gamesPlayed": _number(row.get("GP")),
        "minutes": minutes,
        "points": _number(row.get("PTS")),
        "rebounds": _number(row.get("REB")),
        "assists": _number(row.get("AST")),
        "steals": _number(row.get("STL")),
        "blocks": _number(row.get("BLK")),
        "fieldGoalPercentage": _number(row.get("FG_PCT")),
        "threePointPercentage": _number(row.get("FG3_PCT")),
        "freeThrowPercentage": _number(row.get("FT_PCT")),
    }


def _age_from_birthdate(value) -> int | None:
    text = _optional_text(value)
    if not text:
        return None
    try:
        born = datetime.fromisoformat(text[:10]).date()
        today = datetime.now(ZoneInfo("America/New_York")).date()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except ValueError:
        return None


def _player_upstream_error(exc: Exception, resource: str) -> UpstreamError:
    detail = str(exc).lower()
    message = f"The NBA data provider could not load {resource}. Please try again shortly."
    if "403" in detail or "forbidden" in detail:
        message = f"The NBA data provider blocked the {resource} request. Please try again later."
    elif "timed out" in detail or "timeout" in detail:
        message = f"The NBA data provider took too long to load {resource}. Please try again."
    return UpstreamError(message)


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


def fetch_team_statistics(season: str, timeout: int = 12) -> dict:
    """Fetch league team rates and standings, then normalize one season response."""
    global _last_upstream_request
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)

    now = time.monotonic()
    with _cache_lock:
        cached = _team_stats_cache.get(season)
        if cached and cached[0] > now:
            return cached[1]

    def request(factory):
        global _last_upstream_request
        with _upstream_lock:
            min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
            wait_for = min_gap - (time.monotonic() - _last_upstream_request)
            if wait_for > 0:
                time.sleep(wait_for)
            _last_upstream_request = time.monotonic()
            return factory()

    try:
        base_endpoint = request(lambda: leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Base",
            league_id_nullable="00",
            timeout=timeout,
        ))
        opponent_endpoint = request(lambda: leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            measure_type_detailed_defense="Opponent",
            league_id_nullable="00",
            timeout=timeout,
        ))
        standings_endpoint = request(lambda: leaguestandingsv3.LeagueStandingsV3(
            league_id="00", season=season, season_type="Regular Season", timeout=timeout
        ))
    except Exception as exc:
        logger.warning("NBA team statistics request failed for season %s: %s", season, exc)
        message = "The NBA data provider could not load team statistics. Please try again shortly."
        if "403" in str(exc) or "forbidden" in str(exc).lower():
            message = "The NBA data provider blocked this statistics request. Please try again later."
        elif "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            message = "The NBA data provider took too long to load team statistics. Please try again."
        raise UpstreamError(message) from exc

    try:
        base_rows = _dataset_rows(base_endpoint.league_dash_team_stats)
        opponent_rows = _dataset_rows(opponent_endpoint.league_dash_team_stats)
        standing_rows = _dataset_rows(standings_endpoint.standings)
        catalog = _team_catalog()
        base = {int(row["TEAM_ID"]): row for row in base_rows if _number(row.get("TEAM_ID")) is not None}
        opponent = {int(row["TEAM_ID"]): row for row in opponent_rows if _number(row.get("TEAM_ID")) is not None}
        standings = {int(row["TeamID"]): row for row in standing_rows if _number(row.get("TeamID")) is not None}
        teams = []
        for team_id, identity in catalog.items():
            stats = base.get(team_id, {})
            defense = opponent.get(team_id, {})
            record = standings.get(team_id, {})
            fg_pct = _number(defense.get("OPP_FG_PCT"))
            if fg_pct is None:
                fg_pct = _number(defense.get("FG_PCT"))
            teams.append({
                "id": team_id,
                "name": identity["full_name"],
                "abbreviation": identity["abbreviation"],
                "logoUrl": f"/api/logos/{team_id}",
                "gamesPlayed": _number(stats.get("GP")),
                "pointsPerGame": _number(stats.get("PTS")),
                "threePointersMadePerGame": _number(stats.get("FG3M")),
                "fieldGoalPercentage": _number(stats.get("FG_PCT")),
                "assistsPerGame": _number(stats.get("AST")),
                "reboundsPerGame": _number(stats.get("REB")),
                "opponentPointsPerGame": _number(record.get("OppPointsPG")),
                "stealsPerGame": _number(stats.get("STL")),
                "blocksPerGame": _number(stats.get("BLK")),
                "opponentFieldGoalPercentage": fg_pct,
                "wins": _number(record.get("WINS")) if record else _number(stats.get("W")),
                "winPercentage": _number(record.get("WinPCT")) if record else _number(stats.get("W_PCT")),
                "pointDifferential": _number(record.get("DiffPointsPG")) if record else _number(stats.get("PLUS_MINUS")),
                "currentStreak": _optional_text(record.get("strCurrentStreak")),
            })
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        logger.warning("Unexpected NBA team statistics payload for season %s: %s", season, exc)
        raise UpstreamError("The NBA data provider returned an unexpected team statistics response.") from exc

    result = {"season": season, "perMode": "PerGame", "teams": teams}
    ttl = max(1, int(os.getenv("TEAM_STATS_CACHE_TTL_SECONDS", str(_TEAM_STATS_CACHE_TTL_SECONDS))))
    with _cache_lock:
        _team_stats_cache[season] = (time.monotonic() + ttl, result)
    return result


def fetch_standings(season: str, timeout: int = 12) -> dict:
    """Return the current NBA conference standings from LeagueStandingsV3."""
    if not re.fullmatch(r"\d{4}-\d{2}", season) or season[-2:] != f"{(int(season[:4]) + 1) % 100:02d}":
        raise UpstreamError("season must use the NBA format YYYY-YY.", 422)
    now = time.monotonic()
    with _cache_lock:
        cached = _standings_cache.get(season)
        if cached and cached[0] > now:
            return cached[1]
    try:
        endpoint = _nba_request(lambda: leaguestandingsv3.LeagueStandingsV3(
            league_id="00", season=season, season_type="Regular Season", timeout=timeout
        ))
    except Exception as exc:
        logger.warning("NBA standings request failed for season %s: %s", season, exc)
        message = "The NBA data provider could not load the standings. Please try again shortly."
        if "403" in str(exc) or "forbidden" in str(exc).lower():
            message = "The NBA data provider blocked the standings request. Please try again later."
        elif "timed out" in str(exc).lower() or "timeout" in str(exc).lower():
            message = "The NBA data provider took too long to load the standings. Please try again."
        raise UpstreamError(message) from exc
    try:
        catalog = _team_catalog()
        rows = _dataset_rows(endpoint.standings)
        teams = []
        for row in rows:
            team_id = _int_or_none(row.get("TeamID"))
            conference = _optional_text(row.get("Conference"))
            rank = _int_or_none(row.get("PlayoffRank"))
            if team_id is None or conference not in {"East", "West"} or rank is None:
                continue
            identity = catalog.get(team_id)
            if not identity:
                continue
            teams.append({
                "id": team_id,
                "name": identity["full_name"],
                "abbreviation": identity["abbreviation"],
                "logoUrl": f"/api/logos/{team_id}",
                "conference": conference,
                "rank": rank,
                "wins": _int_or_none(row.get("WINS")),
                "losses": _int_or_none(row.get("LOSSES")),
                "winPercentage": _number(row.get("WinPCT")),
                "gamesBehind": _number(row.get("ConferenceGamesBack")),
                "qualification": "playoff" if rank <= 6 else "play-in" if rank <= 10 else "outside",
            })
        if rows and not teams:
            raise ValueError("LeagueStandingsV3 did not return recognizable conference rows")
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        logger.warning("Unexpected NBA standings payload for season %s: %s", season, exc)
        raise UpstreamError("The NBA data provider returned an unexpected standings response.") from exc
    teams.sort(key=lambda team: (team["conference"], team["rank"], team["name"].casefold()))
    result = {
        "season": season,
        "updatedAt": datetime.now(ZoneInfo("UTC")).isoformat(),
        "conferences": {
            conference: [team for team in teams if team["conference"] == conference]
            for conference in ("East", "West")
        },
    }
    ttl = max(1, int(os.getenv("STANDINGS_CACHE_TTL_SECONDS", str(_STANDINGS_CACHE_TTL_SECONDS))))
    with _cache_lock:
        _standings_cache[season] = (time.monotonic() + ttl, result)
    return result


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
        # Keep NBA Stats requests serialized to avoid bursts and reduce blocking.
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


def fetch_game_details(game_id: str, timeout: int = 12) -> dict:
    """Return a final game's summary and traditional player box score.

    Summary data is returned independently of the player box score so a
    temporary box-score failure does not hide a valid final result.
    """
    global _last_upstream_request
    if not re.fullmatch(r"\d{10}", game_id):
        raise UpstreamError("game_id must be a 10-digit NBA game ID.", 422)

    now = time.monotonic()
    with _cache_lock:
        cached = _game_detail_cache.get(game_id)
        if cached and cached[0] > now:
            summary = cached[1]
        else:
            summary = None

    if summary is None:
        try:
            with _upstream_lock:
                with _cache_lock:
                    cached = _game_detail_cache.get(game_id)
                    if cached and cached[0] > time.monotonic():
                        summary = cached[1]
                if summary is None:
                    min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
                    wait_for = min_gap - (time.monotonic() - _last_upstream_request)
                    if wait_for > 0:
                        time.sleep(wait_for)
                    _last_upstream_request = time.monotonic()
                    endpoint = boxscoresummaryv3.BoxScoreSummaryV3(game_id=game_id, timeout=timeout)
                    summary = _normalize_game_summary(game_id, endpoint)
        except UpstreamError:
            raise
        except Exception as exc:
            logger.warning("NBA game summary request failed for game %s: %s", game_id, exc)
            raise _game_upstream_error(exc, "summary") from exc
    if summary["status"] != "final":
        raise UpstreamError("A final box score is available only after the game is complete.", 409)

    with _cache_lock:
        _game_detail_cache[game_id] = (time.monotonic() + _GAME_DETAIL_CACHE_TTL_SECONDS, summary)

    with _cache_lock:
        cached_boxscore = _boxscore_cache.get(game_id)
        players = cached_boxscore[1] if cached_boxscore and cached_boxscore[0] > time.monotonic() else None
    boxscore_error = None
    if players is None:
        try:
            with _upstream_lock:
                with _cache_lock:
                    cached_boxscore = _boxscore_cache.get(game_id)
                    if cached_boxscore and cached_boxscore[0] > time.monotonic():
                        players = cached_boxscore[1]
                if players is None:
                    min_gap = max(0.0, float(os.getenv("UPSTREAM_MIN_INTERVAL_SECONDS", "0.6")))
                    wait_for = min_gap - (time.monotonic() - _last_upstream_request)
                    if wait_for > 0:
                        time.sleep(wait_for)
                    _last_upstream_request = time.monotonic()
                    endpoint = boxscoretraditionalv3.BoxScoreTraditionalV3(
                        game_id=game_id,
                        start_period=0,
                        end_period=0,
                        start_range=0,
                        end_range=0,
                        range_type=0,
                        timeout=timeout,
                    )
                    players = _normalize_game_players(endpoint, summary)
            with _cache_lock:
                _boxscore_cache[game_id] = (time.monotonic() + _GAME_DETAIL_CACHE_TTL_SECONDS, players)
        except Exception as exc:
            logger.warning("NBA traditional box score request failed for game %s: %s", game_id, exc)
            boxscore_error = _game_upstream_error(exc, "player box score").message

    return {**summary, "players": players, "boxScoreError": boxscore_error}


def _dataset_rows(dataset) -> list[dict]:
    if dataset is None:
        return []
    content = dataset.get_dict()
    headers, rows = content.get("headers"), content.get("data")
    if not isinstance(headers, (list, tuple)) or not isinstance(rows, list):
        raise ValueError("NBA response dataset is malformed")
    return [dict(zip(headers, row)) for row in rows]


def _normalize_game_summary(game_id: str, endpoint) -> dict:
    summary_rows = _dataset_rows(endpoint.game_summary)
    if not summary_rows:
        raise UpstreamError("The NBA data provider could not find this game.", 404)
    source = summary_rows[0]
    if str(source.get("gameId") or "") != game_id:
        raise UpstreamError("The NBA data provider returned a different game.", 502)
    status_id = int(source.get("gameStatus") or 0)
    status = {1: "scheduled", 2: "live", 3: "final"}.get(status_id, "unknown")
    line_scores = _dataset_rows(endpoint.line_score)
    catalog = _team_catalog()
    sides: dict[int, dict] = {}
    for row in line_scores:
        team_id = int(row.get("teamId") or 0)
        info = catalog.get(team_id, {})
        name = info.get("full_name") or " ".join(filter(None, [row.get("teamCity"), row.get("teamName")])) or "Unknown team"
        periods = []
        period_keys = sorted(
            (key for key in row if re.fullmatch(r"period\d+Score", str(key))),
            key=lambda key: int(re.search(r"\d+", key).group()),
        )
        for key in period_keys:
            value = _number(row.get(key))
            if value is not None:
                number = int(re.search(r"\d+", key).group())
                periods.append({"period": number, "label": f"OT{number - 4}" if number > 4 else str(number), "score": int(value)})
        sides[team_id] = {
            "id": team_id,
            "name": name,
            "abbreviation": info.get("abbreviation") or row.get("teamTricode") or "",
            "logoUrl": f"/api/logos/{team_id}" if info else None,
            "score": _int_or_none(row.get("score")),
            "periods": periods,
        }

    # nba_api's installed V3 parser exposes regulation periods in its tabular
    # LineScore dataset. Retain any overtime periods present in the raw V3
    # response as well, since those are intentionally omitted from that table.
    raw_summary = (endpoint.get_dict() or {}).get("boxScoreSummary", {})
    for raw_side in ("awayTeam", "homeTeam"):
        raw_team = raw_summary.get(raw_side) or {}
        team_id = _int_or_none(raw_team.get("teamId"))
        if team_id not in sides or not isinstance(raw_team.get("periods"), list):
            continue
        raw_periods = []
        for period in raw_team["periods"]:
            number = _int_or_none(period.get("period"))
            score = _int_or_none(period.get("score"))
            if number and score is not None:
                raw_periods.append({"period": number, "label": f"OT{number - 4}" if number > 4 else str(number), "score": score})
        if raw_periods:
            sides[team_id]["periods"] = sorted(raw_periods, key=lambda item: item["period"])

    away_id = int(source.get("awayTeamId") or 0)
    home_id = int(source.get("homeTeamId") or 0)
    if away_id not in sides or home_id not in sides:
        raise ValueError("NBA game summary is missing a team line score")
    arena_rows = _dataset_rows(endpoint.arena_info)
    info_rows = _dataset_rows(endpoint.game_info)
    inactive_players = {"away": [], "home": []}
    for row in _dataset_rows(endpoint.inactive_players):
        team_id = int(row.get("teamId") or 0)
        side = "away" if team_id == away_id else "home" if team_id == home_id else None
        player_id = int(row.get("personId") or 0)
        if side and player_id > 0:
            inactive_players[side].append({
                "playerId": player_id,
                "name": " ".join(filter(None, [str(row.get("firstName") or "").strip(), str(row.get("familyName") or "").strip()])) or "Unknown player",
                "jerseyNumber": _optional_text(row.get("jerseyNum")),
            })
    game_time = source.get("gameTimeUTC")
    if game_time:
        game_time = datetime.fromisoformat(str(game_time).replace("Z", "+00:00")).isoformat()
    return {
        "gameId": game_id,
        "status": status,
        "statusText": str(source.get("gameStatusText") or "Status unavailable"),
        "period": int(source.get("period") or 0),
        "clock": source.get("gameClock") or None,
        "gameDate": _optional_text((info_rows[0] if info_rows else {}).get("gameDate")) or (game_time[:10] if game_time else None),
        "scheduledStartTime": game_time,
        "arenaName": _optional_text((arena_rows[0] if arena_rows else {}).get("arenaName")),
        "awayTeam": sides[away_id],
        "homeTeam": sides[home_id],
        "inactivePlayers": inactive_players,
    }


def _normalize_game_players(endpoint, summary: dict) -> dict:
    rows = _dataset_rows(endpoint.player_stats)
    if not rows:
        raise ValueError("NBA box score did not contain player rows")
    players = {"away": [], "home": []}
    for row in rows:
        team_id = int(row.get("teamId") or 0)
        side = "away" if team_id == summary["awayTeam"]["id"] else "home" if team_id == summary["homeTeam"]["id"] else None
        if side is None:
            continue
        player_id = int(row.get("personId") or 0)
        if player_id <= 0:
            continue
        name = " ".join(filter(None, [str(row.get("firstName") or "").strip(), str(row.get("familyName") or "").strip()])) or str(row.get("nameI") or "Unknown player")
        players[side].append({
            "playerId": player_id,
            "name": name,
            "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
            "jerseyNumber": _optional_text(row.get("jerseyNum")),
            "minutes": _optional_text(row.get("minutes")),
            "comment": _optional_text(row.get("comment")),
            "didNotPlay": bool(_optional_text(row.get("comment"))) and not _optional_text(row.get("minutes")),
            "points": _int_or_none(row.get("points")),
            "rebounds": _int_or_none(row.get("reboundsTotal")),
            "assists": _int_or_none(row.get("assists")),
            "fieldGoalsMade": _int_or_none(row.get("fieldGoalsMade")),
            "fieldGoalsAttempted": _int_or_none(row.get("fieldGoalsAttempted")),
            "threePointersMade": _int_or_none(row.get("threePointersMade")),
            "threePointersAttempted": _int_or_none(row.get("threePointersAttempted")),
            "freeThrowsMade": _int_or_none(row.get("freeThrowsMade")),
            "freeThrowsAttempted": _int_or_none(row.get("freeThrowsAttempted")),
            "steals": _int_or_none(row.get("steals")),
            "blocks": _int_or_none(row.get("blocks")),
            "turnovers": _int_or_none(row.get("turnovers")),
            "plusMinus": _int_or_none(row.get("plusMinusPoints")),
        })
    for side in ("away", "home"):
        existing_ids = {player["playerId"] for player in players[side]}
        for player in summary["inactivePlayers"][side]:
            if player["playerId"] in existing_ids:
                continue
            player_id = player["playerId"]
            players[side].append({
                **player,
                "headshotUrl": f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png",
                "minutes": None,
                "comment": "Inactive",
                "didNotPlay": True,
                "points": None, "rebounds": None, "assists": None,
                "fieldGoalsMade": None, "fieldGoalsAttempted": None,
                "threePointersMade": None, "threePointersAttempted": None,
                "freeThrowsMade": None, "freeThrowsAttempted": None,
                "steals": None, "blocks": None, "turnovers": None,
                "plusMinus": None,
            })
    return players


def _int_or_none(value):
    number = _number(value)
    return int(number) if number is not None else None


def _game_upstream_error(exc: Exception, part: str) -> UpstreamError:
    detail = str(exc).lower()
    message = f"The NBA data provider could not load the game's {part}. Please try again shortly."
    if "403" in detail or "forbidden" in detail:
        message = f"The NBA data provider blocked the game's {part} request. Please try again later."
    elif "timed out" in detail or "timeout" in detail:
        message = f"The NBA data provider took too long to load the game's {part}. Please try again."
    return UpstreamError(message)
