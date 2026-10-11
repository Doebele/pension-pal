from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, field_validator


def _load_valid_location_codes() -> set[tuple[str, str]]:
    data_path = Path(__file__).resolve().parent.parent / "data" / "swiss_locations.json"
    if not data_path.exists():
        return set()
    with data_path.open("r", encoding="utf-8") as file:
        rows = json.load(file)
    return {(str(row["canton"]).upper(), str(row["id"])) for row in rows}


VALID_LOCATION_CODES = _load_valid_location_codes()


class SwissLocationSelection(BaseModel):
    canton_code: str
    municipality_id: str

    @field_validator("canton_code")
    @classmethod
    def validate_canton_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 2:
            raise ValueError("Invalid canton code format.")
        return normalized

    @field_validator("municipality_id")
    @classmethod
    def validate_municipality_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Municipality id must not be empty.")
        return normalized

    @field_validator("municipality_id")
    @classmethod
    def validate_location_pair(cls, municipality_id: str, info) -> str:
        canton_code = (info.data.get("canton_code") or "").upper()
        if VALID_LOCATION_CODES and (canton_code, municipality_id) not in VALID_LOCATION_CODES:
            raise ValueError("Invalid Swiss location selection.")
        return municipality_id


class PropertyLocationPayload(BaseModel):
    location: Optional[SwissLocationSelection] = None
