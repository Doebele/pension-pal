from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import time
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from .core.config import settings
from .db import Base, engine
from .routes import ai, auth, calc, imports, profile, webauthn

app = FastAPI(title=settings.app_name)

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _quoted_identifier(name: str) -> str:
    return f'"{name}"'


def _sync_missing_columns() -> None:
    """Best-effort runtime schema sync for additive column changes."""
    db_inspector = inspect(engine)
    metadata_tables = Base.metadata.tables

    with engine.begin() as connection:
        for table_name, table in metadata_tables.items():
            if not db_inspector.has_table(table_name):
                continue

            existing_columns = {
                column["name"]
                for column in db_inspector.get_columns(table_name)
            }
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                if column.primary_key:
                    # Primary keys should be created with the table definition.
                    continue

                compiled_type = column.type.compile(dialect=engine.dialect)
                nullable_sql = "" if column.nullable else " NOT NULL"
                statement = (
                    f"ALTER TABLE {_quoted_identifier(table_name)} "
                    f"ADD COLUMN {_quoted_identifier(column.name)} {compiled_type}{nullable_sql}"
                )
                connection.execute(text(statement))


@app.on_event("startup")
def initialize_database():
    # Retry because db container/network may not be ready yet.
    last_error: Exception | None = None
    for _ in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            _sync_missing_columns()
            # E-Mail eindeutig ohne Gross-/Kleinschreibung; alte Konten ohne E-Mail (NULL) duerfen mehrfach
            with engine.begin() as connection:
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower "
                    "ON users (lower(email)) WHERE email IS NOT NULL"
                ))
            return
        except SQLAlchemyError as exc:
            last_error = exc
            time.sleep(2)
    if last_error:
        raise last_error


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(webauthn.router)
app.include_router(profile.router)
app.include_router(calc.router)
app.include_router(imports.router)
app.include_router(ai.router)

