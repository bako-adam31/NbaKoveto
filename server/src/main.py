import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from .services.nba import UpstreamError, current_nba_season, fetch_games, fetch_games_window, fetch_player_leaders, fetch_team_logo, fetch_team_roster, get_nba_teams

load_dotenv()
app = FastAPI(title="The Daily Dunk API", version="0.1.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX", r"https?://(localhost|127\.0\.0\.1)(:\d+)?"),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "the-daily-dunk-api", "timezone": "America/New_York"}


@app.get("/api/teams")
def teams():
    return {"teams": get_nba_teams()}


@app.get("/api/players/leaders")
def player_leaders(season: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$")):
    selected_season = season or current_nba_season()
    try:
        players = fetch_player_leaders(
            selected_season,
            int(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "12")),
        )
        return {"season": selected_season, "perMode": "PerGame", "players": players}
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.get("/api/teams/{team_id}/roster")
def team_roster(
    team_id: int,
    season: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    selected_season = season or current_nba_season()
    try:
        players = fetch_team_roster(
            team_id,
            selected_season,
            int(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "12")),
        )
        team = next((item for item in get_nba_teams() if item["id"] == team_id), None)
        if team is None:
            raise HTTPException(status_code=404, detail="Unknown NBA team.")
        return {"team": team, "season": selected_season, "players": players}
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

@app.get("/api/logos/{team_id}")
def team_logo(team_id: int):
    try:
        content, content_type = fetch_team_logo(team_id)
        return Response(content, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

@app.get("/api/games")
def games(date_param: str | None = Query(default=None, alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$")):
    if date_param is None:
        day = datetime.now(ZoneInfo("America/New_York")).date()
    else:
        try:
            day = date.fromisoformat(date_param)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="date must be a valid calendar date in YYYY-MM-DD format") from exc
    try:
        data = fetch_games(day, int(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "12")), int(os.getenv("CACHE_TTL_SECONDS", "45")))
        return {"date": day.isoformat(), "timezone": "America/New_York", "games": data}
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.get("/api/games/window")
def games_window(
    start_date: str = Query(alias="start_date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    days: int = Query(default=3, ge=1, le=7),
    timezone_name: str = Query(default="UTC", alias="timezone"),
):
    try:
        first_day = date.fromisoformat(start_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="start_date must be a valid calendar date in YYYY-MM-DD format") from exc
    try:
        user_timezone = ZoneInfo(timezone_name)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="timezone must be a valid IANA timezone") from exc

    try:
        result = fetch_games_window(
            first_day,
            days,
            user_timezone,
            int(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "12")),
            int(os.getenv("CACHE_TTL_SECONDS", "45")),
        )
        return {
            "startDate": first_day.isoformat(),
            "days": days,
            "timezone": timezone_name,
            "games": result,
        }
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
