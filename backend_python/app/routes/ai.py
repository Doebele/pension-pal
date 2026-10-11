import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..core.config import settings
from ..db import get_db
from ..models.user import PersonProfile, User
from ..services import ai as ai_service
from .profile import get_authenticated_user

# Kept out of /api/profile-state on purpose: that payload feeds the CSV export,
# and API keys must never end up in an export file.
router = APIRouter(prefix="/api", tags=["ai"])


class AiConfig(BaseModel):
    provider: str = Field(default="disabled", max_length=40)
    endpoint: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=200)
    key: str = Field(default="", max_length=500)


class AiProfile(BaseModel):
    endpoint: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=200)
    key: str = Field(default="", max_length=500)
    ok: bool = False


class AiSettings(AiConfig):
    profiles: dict[str, AiProfile] = Field(default_factory=dict, max_length=50)


def _production() -> bool:
    return settings.app_env == "production"


def load_ai_settings(db: DbSession, user_id: int) -> Optional[dict]:
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user_id).first()
    return profile.ai_settings if profile else None


@router.get("/ai-settings")
def get_ai_settings(db: DbSession = Depends(get_db), user: User = Depends(get_authenticated_user)):
    return {"status": "ok", "ai": load_ai_settings(db, user.id) or AiSettings().model_dump()}


@router.put("/ai-settings")
def save_ai_settings(
    data: AiSettings,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_authenticated_user),
):
    if data.provider != "disabled":
        try:
            ai_service.check_endpoint(data.endpoint, _production())
        except ai_service.AiError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    profile = db.query(PersonProfile).filter(PersonProfile.user_id == user.id).first()
    if profile is None:
        profile = PersonProfile(user_id=user.id)
        db.add(profile)
    profile.ai_settings = data.model_dump()
    db.commit()
    return {"status": "ok", "ai": profile.ai_settings}


@router.post("/ai/test")
async def test_ai(data: AiConfig, user: User = Depends(get_authenticated_user)):
    """Validate endpoint/key, list available models and (if a model is chosen) ping it.

    Uses the values from the UI, not necessarily saved yet.
    → {ok, models: list|None, model?, reply?, latencyMs?}
    """
    ai = data.model_dump()
    try:
        ai_service.check_endpoint(data.endpoint, _production())
    except ai_service.AiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    models, list_err = None, None
    try:
        models = await run_in_threadpool(ai_service.list_models, ai)
    except ai_service.AiError as exc:
        list_err = exc
    if not data.model:
        if models is None:
            raise HTTPException(status_code=502, detail=str(list_err))
        return {"ok": True, "models": models}

    started = time.monotonic()
    try:
        text, model = await run_in_threadpool(ai_service.chat, ai, "Reply with the single word OK.", "OK?", 200, 30.0)
    except ai_service.AiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "models": models, "model": model, "reply": text.strip() or "(empty)",
            "latencyMs": round((time.monotonic() - started) * 1000)}
