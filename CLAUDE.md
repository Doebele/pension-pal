# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Start local stack
```bash
docker compose -f docker-compose.dev.yml up --build -d
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8001
- PostgreSQL: localhost:5432

### Backend (Python)
```bash
cd backend_python
pip install -r requirements.txt

# Run all tests
PYTHONPATH=. pytest -q

# Run a single test file
PYTHONPATH=. pytest tests/test_ocr.py -v

# Run backend directly (without Docker)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (React)
```bash
cd frontend
npm ci
npm run dev          # Vite dev server on :5173
npm run build        # Production build
npm run check:text   # Text quality lint
npm run typecheck    # tsc (strict, tsconfig.json); also runs in CI
```

### Deploy to production
Server, login and paths are placeholders here; the real values are in the git-ignored `CLAUDE.local.md`.
```bash
# CI/CD: push to main triggers GitHub Actions automatically
git push origin main

# Manual deploy on VPS
ssh <user>@<vps-host>
cd <deploy-path> && bash deploy.sh deployment-config/strato-vps.env docker-compose.prod.yml

# Production DB backup (also nightly 03:15 UTC via root crontab, 14 days kept in <deploy-path>/backups)
<deploy-path>/scripts/backup-db.sh manual

# Restart nginx after container IP changes (fixes 502) — deploy.sh now does this automatically
docker restart pension_pal_nginx
```

## Architecture

### Stack
- **Frontend:** React 18 + Vite + TanStack Query + Tailwind CSS + Framer Motion
- **Backend:** FastAPI + SQLAlchemy 2.0 (Mapped types) + PostgreSQL 16
- **OCR:** pdfplumber → pytesseract → Mistral OCR API (3-tier fallback in `backend_python/app/services/ocr.py`)
- **Auth:** Custom session tokens via `X-User-Id` / `X-Session-Token` headers (no JWT); routes in `routes/auth.py`

### Backend structure
```
backend_python/app/
├── core/config.py          # Pydantic settings (env vars: DATABASE_URL, MISTRAL_API_KEY, SECRET_KEY)
├── main.py                 # FastAPI app, CORS, startup DB init + _sync_missing_columns()
├── db.py                   # SQLAlchemy engine + Base
├── models/
│   ├── user.py             # User, PersonProfile (incl. ui_theme/ui_language/ui_density), Session, ThreeAMarkingState
│   ├── pension.py          # PropertyAsset, PensionFundSnapshot, ThirdPillar, AhvProjection,
│   │                       # AhvContributionYear, LifeInsurancePolicy, SeverancePlan, Scenario
│   └── documents.py        # Document, OcrExtraction, ImportQueueItem
├── routes/
│   ├── profile.py          # Auth + all GET/POST for profile data (large file, ~1200 lines); profile-state
│   │                       # returns `preferences` (uiTheme/uiLanguage/uiDensity); PUT /api/preferences updates them
│   ├── calc.py             # Pension calculation endpoints
│   └── imports.py          # File upload, CSV profile import, document OCR routing
└── services/
    ├── ocr.py              # Text extraction pipeline (pdfplumber → pytesseract → Mistral)
    ├── ahv_contribution_parser.py
    ├── life_insurance_import_parser.py
    ├── profile_csv_import.py  # Full profile CSV round-trip (validate + apply)
    ├── compliance_calculations.py
    └── validation_service.py
```

### Schema migrations
There are **no Alembic migrations**. The app uses `Base.metadata.create_all()` on startup plus `_sync_missing_columns()` in `main.py` which performs additive-only `ALTER TABLE ADD COLUMN` at runtime. Destructive schema changes must be done manually.

### Frontend structure
```
frontend/src/
├── pages/          # Dashboard, Analysis, MonteCarlo, ImportExport, Login, Knowledge
├── components/     # cards/ (AHV, BVG, 3a, Property, Insurance, Severance), common/, import/, layout/ (Sidebar = Rail nav)
├── store/
│   └── uiPreferencesStore.ts  # Zustand+persist: theme, density, uiLanguage, railOpen (localStorage "pensionpal-ui-v1")
├── i18n/
│   ├── index.ts        # react-i18next + language detector, fallbackLng "de", namespace "common"
│   ├── de/common.json  # German UI strings (nav, rail, backend, user)
│   └── en/common.json  # English UI strings
├── constants/
│   └── chartColors.ts  # CHART_CATEGORICAL palette + useChartThemeColors() (from Doebele/fintools)
├── services/
│   ├── api.ts          # Fetch client with multi-base fallback (tries :8000, :8001, :8002); api.updatePreferences()
│   ├── dataExporter.ts # Builds CSV export — capitalNeedPercent from scenario.analysis_state
│   └── dataImporter.ts # Parses CSV import rows
└── types/          # TypeScript types for all domain models
```

### Design tokens & theming
- `styles.css` defines a CSS-variable token system (`--bg`, `--surface`, `--surface-2/3`, `--border`, `--fg-1/2/3`,
  `--accent` + opacity variants, `--green`/`--red`/`--yellow`, spacing `--sp-1..10`, radius `--r-xs..pill`),
  with a `[data-theme="light"]` override block. `tailwind.config.cjs` maps these to `bg-surface`, `text-fg-1`, etc.
- The Rail navigation (`components/layout/Sidebar.tsx`) and app shell (`App.tsx`) use these tokens directly.
- Legacy `slate-*`/`neutral-*`/`gray-*` and accent classes (`emerald`, `rose`, `amber`, `blue`, `red`, `green`,
  `sky`, `indigo`, `cyan`, `lime`) are remapped in `tailwind.config.cjs` to theme-aware RGB-triple CSS variables
  (`--tw-slate-50..950` etc. in `styles.css`). Dark mode = Tailwind defaults; `[data-theme="light"]` mirrors each
  scale (pale text ↔ dark text, dark surfaces ↔ light surfaces), so all legacy components are light-mode-correct
  without per-component edits. New code should still prefer the semantic tokens (`bg-surface`, `text-fg-1`).
- Segmented toggles in content use `.seg-row`/`.seg-btn`/`.active` (same look as the rail's density/theme/language
  toggles); use these instead of ad-hoc tab/chip styling.
- `App.tsx` sets `document.documentElement.dataset.theme` from `useUiPreferencesStore()` and syncs
  theme/density/language with the backend via `GET /api/profile-state` (`preferences` block) on login and
  `PUT /api/preferences` on change.
- Icons use `iconoir-react` (migrated from `lucide-react`); shared icon set in `components/icons/iconMap.tsx`.

### i18n
- `react-i18next` with `i18next-browser-languagedetector`, namespace `common`, `fallbackLng: "de"`, persisted
  to `localStorage` under `pensionpal-ui-language` and to `PersonProfile.ui_language` via `/api/preferences`.
- Translated (DE/EN in `i18n/de|en/common.json`): Rail navigation + footer, all dashboard cards (Personal, AHV
  incl. import drawer + contribution table, BVG, 3a incl. Motion-Ettlin tab, Life Insurance incl. import drawer,
  Severance, Assets), card titles/summary tiles, Dashboard toasts, Login, Monte Carlo, Import/Export + CSV modals,
  Analysis page chrome (scenarios, sections, chart legends/tooltips, AnalysisInputs allocation panel,
  STEUERÜBERSICHT/tax-overview block), upload zones, account menu.
- The legacy `frontend/translations/de.json` mechanism has been fully migrated into `i18n/de|en/common.json` and
  removed; `src/config/analysisLayoutConfig.json` now holds only numeric slider config (min/max/step/default),
  no text. Still German-only: Knowledge article content.

### API conventions
- All routes prefixed `/api/`
- Auth via headers `X-User-Id` + `X-Session-Token` on every request
- Frontend auto-discovers backend port (tries 8000 → 8001 → 8002) unless `VITE_API_BASE_URL` is set
- UI chrome (nav/settings) is translatable (DE/EN, default DE); form/card content and code/comments remain **German UI / English code** for now

### OCR pipeline (`services/ocr.py`)
`extract_fields(filename, payload, mime_type, mistral_api_key)` returns `(document_type, list[OcrField])`.
1. If `MISTRAL_API_KEY` set → POST to `https://api.mistral.ai/v1/ocr` with base64 payload
2. PDF → pdfplumber; if text < 50 chars → pdf2image + pytesseract (`deu+fra+eng`)
3. Image → pytesseract directly
4. Falls back to raw UTF-8 decode on any exception (keeps tests working with plain-text bytes)

Document type: `detect_document_type(filename, text)` — filename keywords first, then the content (Vorsorgeausweis,
Altersguthaben → `pension_fund`; Lebensversicherung, Erlebensfall, Rückkaufswert → `life_insurance`).
Unmatched fields stay **empty with confidence 0** (they used to get made-up example values like 350000 / 6.8 /
756.0000.0000.00). Amounts go through `ocr.parse_amount()` (1'234.50, 1 234.50, 1.234,50) and the shared `AMOUNT`/`GAP`
regexes, which allow "per 31.12.2024: CHF" between label and value.

Life insurance has one parser, `services/life_insurance_import_parser.py` (`POST /api/life-insurance/import`, review
drawer in the Lebensversicherung card): text + tables via pdfplumber, OCR fallback via `ocr._get_text()` for scans,
then the configured AI model (`ocr.refine_with_ai`). `/api/import/document` only reports `life_insurance`; the
frontend then calls the life-insurance endpoint, so values are never applied without review.

### AI models (settings → document import)
Ported from Doebele/fintools. `PersonProfile.ai_settings` (JSON) = `{ provider, endpoint, model, key, profiles: { [providerId]: { endpoint, model, key, ok } } }`.
The top-level fields are the active config (the only part the backend reads); `profiles` remembers every provider's
config so switching providers restores its key/model, `ok` drives the ✓ / 🔑 tags in the provider dropdown.
- UI: `components/settings/SettingsModal.tsx` (account menu → Einstellungen). Provider list `AI_PROVIDERS` lives there —
  an OpenAI-compatible provider needs only a new entry.
- Routes (`routes/ai.py`): `GET/PUT /api/ai-settings`, `POST /api/ai/test` (model list + optional ping). Deliberately
  **not** part of `/api/profile-state`, which feeds the CSV export — API keys must never land in a CSV.
- Adapter `services/ai.py`: Anthropic via native Messages API, everything else OpenAI-compatible. `ai_base()` appends
  `/v1` only to a bare host and rewrites `localhost` → `host.docker.internal` inside Docker. Local providers get
  `reasoning_effort: none` + `/no_think`; OpenAI gets `max_completion_tokens`.
- `check_endpoint()`: in production (`APP_ENV=production`, anyone can register) only public https hosts are allowed —
  blocks SSRF to internal services. Checked on save, test and again on every import.
- `ocr.extract_fields(..., ai=)`: regex patterns run first, then `_refine_with_ai()` overrides values the model found
  (`confidence 0.95`, `source_pattern "ai:<model>"`); any AI failure keeps the regex result.
- Settings backup: Import/Export → "Einstellungen sichern" downloads `{ format: "pension-pal-settings", version: 1, settings: { preferences, ai } }`
  including every API key in plain text, and restores it via `PUT /api/preferences` + `PUT /api/ai-settings`.

### Cockpit view (nav "Cockpit (Planung)", `#cockpit`)
- Same component and state as the Analysis page: `<Analysis layout="cockpit" />`. The render is split into named JSX
  blocks (`scenarioButtons`, `baseSliders`, `taxControls`, `allocationInputs`, `incomeChart`, …); `classicView` assembles
  them as before, the cockpit puts results in the content and inputs in a right sidebar with tabs
  (Szenario / Abfindung / Vorsorge / Anlage / Bedarf). New blocks must be added to both arrangements.
- `PayoutPlanningSection` `part`: `"all"` (classic), `"pillars"` / `"investment"` (sidebar inputs, compact one-column,
  no Monte Carlo), `"results"` (content).
- Content = `CockpitBoard` (`components/analysis/CockpitBoard.tsx`, dnd-kit sortable): each result area is a card,
  collapsible and reorderable by its handle (mouse, touch, keyboard: Space + arrows). Order + collapsed ids per browser
  in localStorage `pensionpal-cockpit-layout-v1`; unknown/new cards are inserted at their default position.
  `PayoutPlanningSection` result parts: `kpis`, `sources`, `variants`, `median`, `chartIncome`, `chartWealth` (full
  width when separate), `taxes`, `warnings`; Monte Carlo / comparison only computed by the parts that need them.
  Inner headings marked `card-title` are hidden inside cards (title is in the card head).
- Sidebar (480 px): docked + sticky from 1280 px, below that a drawer over the content (`styles/analysis-grid.css`, `.cockpit*`).
  Open state and tab per browser in localStorage `pensionpal-cockpit-v1`.

### Payout planning (Analysis → Bezugsplanung)
- `services/payoutPlanning.ts`: `capitalWithdrawalTax()` interpolates official ESTV values
  (`data/capitalTaxTables.json`, generated by `scripts/fetch-capital-tax-tables.py` via the ESTV calculator API
  `API_calculateManyCapitalTaxes`, group 88 = cantonal capitals). `simulatePayoutPlan()` sums 2nd-pillar + 3a lump sums
  per age for the tax, treats 3b capital as tax-free, invests net capital and draws a constant real annuity until
  `targetAge`. AHV is given in today's francs and follows inflation; BVG/3b pensions stay nominal.
- Self-check: `npm run check:payout` (Node 22 `--experimental-strip-types`, no test runner; runs in CI). JSON import
  needs `with { type: "json" }` for Node.
- UI `components/analysis/PayoutPlanningSection.tsx`; first fill from the profile (age from `date_of_birth`, not the
  analysis default), afterwards persisted as `analysis_state.payoutPlan`.
  The profile is read on every display. `settings.profileSync` remembers the card values last taken over;
  `syncFromProfile()` applies every card value that changed since then automatically (notice with undo in the
  "warnings" part, i.e. above the Cockpit cards / at the end of the classic section). Values changed only in the plan
  stay while the card is unchanged; then the manual "Werte aus Profil übernehmen" notice (`applyProfile()`) remains.
  Only the "all" / "warnings" instance syncs (the Cockpit renders several parts).
  Non-CHF life insurance shows a warning (no FX conversion).
- Capital sources: `simulatePayoutPlan()` returns `inflows` (age, year, source bvg/pillar3a/life/start, gross, tax share,
  net, netReal). Tax of a year is split by amount over the PK + 3a lump sums of that year. The section shows them as
  "Herkunft des Anlagekapitals" (buy-in from the severance split off the PK row); their `netReal` total is the pot base.
- Buckets + Monte Carlo: `portfolioStats()`, `monteCarlo()` (mulberry32 seed, lognormal), `safeMonthlyDraw()`
  (bisection on the draw factor for 90 % success). Old settings without `buckets` become one custom bucket
  (`bucketsOf()`).
- `Analysis.tsx` runs the same plan (`buildPayoutInput` + `simulatePayoutPlan`): the top income chart takes fund/3b
  pensions and the capital draw from it (3a no longer as a monthly amount). The wealth overview (to age 100) runs
  the same plan three times: 100 % BVG lump sum, 100 % pension and the chosen share (no own inputs any more).
- Medians (`services/swissMedians.ts`, same figures/sources as Budget-Pal `swiss_medians.py`): retiree income SILC 2018
  (disposable, couple × 1.5), wealth by age LUSTAT Lucerne 2020 (to 74), BFS new pensions 2024. Compared against net
  income = pensions × (1 − Analysis `effectiveTaxRate`) + capital draw; households add `partnerMonthlyIncome`.
- Early retirement: `buildPayoutInput(settings, ctx, retireAt)` — AHV from `ahvStartAgeFor()` (reference age − 2) with
  `ahvFactor()`, BVG capital ± `bvgAnnualCredit` per year, conversion × `bvgConversionFactor()` ratio, 3a payouts shifted.
  The factor constants live in `payoutPlanning.ts` and are imported by `Analysis.tsx`. Context takes `ahvBaseAnnual`
  (unreduced AHV), not the reduced value.
- Severance buy-in (Analysis → "Verwendung der Abfindung", `AnalysisInputs`): `BvgBuyIn` {amount, paidAtAge from the
  severance due month/year, ratePercent = the fund's crediting rate, default BVG minimum 1.25 %}. `bvgBuyInAtRetirement()`
  adds it with interest to the plan's BVG capital (also for the 60–66 comparison); `buyInBlocksCapital()` warns when a
  lump sum follows a buy-in within 3 years (BVG Art. 79b Abs. 3).
- AHV estimate from the contribution history: `services/ahvEstimate.ts` (`ahvHistoryStats`, `estimateAhvAnnualPension`) is
  the one source for the AHV card display and for what `saveAhvWithSnapshot` stores as `expected_annual_pension` (which
  Analysis/Cockpit read). Contribution years: past years only with income > 0 (0 = gap), future years count until the
  year before the legal reference age (mandatory contributions, also when not employed); duplicates once. The «Total»
  column is ignored when it exceeds the year's income (cumulative in real imports); then AHV rate × average income.
  Accepting an AHV import saves immediately; table edits save on card switch / Save as before.
- AHV reference age: the AHV card's "Geplantes Pensionsalter" is stored as `ahv.reference_age` — it is the *planned*
  retirement age, not the legal one (`legalAhvReferenceAge(gender, birthYear)`: 65; women up to 1961: 64). The card
  uses the plan's timing (`ahvTiming()` in `services/ahvEstimate.ts`): AHV starts at retirement, at the earliest 2 years
  before the reference age, at most 5 years deferred; retiring earlier alone does not reduce the AHV. Vorbezug/Aufschub
  are derived (read-only) and saved as such. Analysis takes the unreduced AHV from the saved `contribution_years` +
  `estimated_average_income_chf` (`ahvUnreducedAnnualPension`); `unreducedAhvFromCard()` is only the fallback.
- Severance date: the block's "Verwendung ab" month/year is the severance due date (`start_calculation_month/year`,
  shared with the severance card); buy-in and savings grow from there, age at payment from the exact birth date.
- `AutoSaveManager` saves only on a real state change (callbacks in refs); it used to loop every ~0.5 s.
  `PUT /api/scenario/bvg-mortgage-repayment` assigns a new `parameters` dict — in-place mutation of a JSON column is
  not detected by SQLAlchemy (analysis_state never updated after the first save).

### Accounts & password reset (`routes/auth.py`)
Ported from Budget-Pal (feat/passwort-reset, passkeys) and Fintools (auth commits 2c10ede/1dd51ab, invites).
- `User.email` (nullable for old accounts; unique via index `uq_users_email_lower` on `lower(email)`, created in
  `main.py` startup), `password_reset_hash` (SHA-256 only), `password_reset_expires`.
- Set passwords only via `auth._set_password()`: it deactivates the user's other sessions (all of them after a reset)
  and clears an open reset link. New passwords need 8+ chars; login still accepts old short PINs.
- Login: exact `display_name` match first, then `lower(email)` if the input contains `@`. Same 401 for unknown user
  and wrong password.
- Errors are fixed English strings (`ERR_*`); the frontend translates them in `services/authErrors.ts`.
- Rate limits: in-memory `core/rate_limit.py` (from Budget-Pal). `_client_ip()` takes the second-to-last
  `X-Forwarded-For` hop (host nginx → container nginx); adjust if the proxy chain changes.
- Mail: `services/mailer.py` (smtplib, background task). Links only from `settings.app_base_url`.
  Production SMTP comes from `deployment-config/smtp.env` on the VPS (optional `env_file`).
- Frontend: `pages/Login.tsx` (modes login/register/forgot/reset; entry via `/reset-password#token=…` and
  `/forgot-password`, cleared from the address bar), `components/settings/AccountSettings.tsx` (Profil tab).
- Invites (as Fintools, `routes/auth.py`): `Invite` table, register checks the code first (`_is_bootstrap()` lets the
  first account of an empty DB in without one) and consumes it with a guarded `UPDATE` in the same transaction.
  Revoke = delete an unused own code. UI: Profil tab; `/?invite=CODE` opens the register view pre-filled.
- Passkeys (as Budget-Pal incl. fix/passkeys, `routes/webauthn.py`, lib `webauthn` + `@simplewebauthn/browser`):
  `WebAuthnCredential` + `WebAuthnChallenge` (DB, 5 min, found via `clientDataJSON`, consumed on every verify).
  Adding needs the current password + sends an info mail; UV required; `reset_password` deletes all passkeys.
  `settings.webauthn_rp_id` / `webauthn_origins_raw` must match the served domain (prod values in compose).
  UI: login button, Sicherheit tab (`components/settings/SecuritySettings.tsx`).
- Tests: `tests/test_auth.py`, `test_invites.py`, `test_passkeys.py` (software authenticator, EC P-256), shared
  fixture in `tests/conftest.py` (SQLite in memory, mails captured, rate limits reset).

### Export/Import CSV
- `dataExporter.ts:buildExportCsvData()` produces a single-row CSV with 19 summary fields + `profilePayloadJson` (full nested JSON)
- Import uses `profilePayloadJson` as primary data source; the 19 summary fields are human-readable metadata
- Export version is hardcoded `"1.0"`; import accepts `>= 1.0`

### CI/CD
GitHub Actions (`.github/workflows/deploy.yml`):
1. `test`: frontend build + `PYTHONPATH=. pytest -q`
2. `build-and-push`: builds `web` and `backend` images, pushes to `ghcr.io/doebele/pension-pal/*` (public packages)
3. `deploy`: SSH into VPS, `git pull` via HTTPS+PAT, `docker login ghcr.io`, runs `deploy.sh`

Required secrets: `STRATO_HOST`, `STRATO_USER`, `STRATO_SSH_KEY`, `STRATO_PORT`, `STRATO_DEPLOY_PATH`, `STRATO_REPO_SSH_URL`, `STRATO_ENV_FILE`, `GH_PAT`.

`VITE_API_BASE_URL` is passed as a Docker build-arg (baked into the frontend image at build time). Production uses the same-origin `/api` (not an absolute `http://…` URL) so the page works over HTTPS without mixed-content blocking. TLS is terminated by the host nginx (`/etc/nginx/sites-available/pensionpal`, Let's Encrypt via certbot, auto-renewed by `certbot.timer`).
The host nginx needs `client_max_body_size 12m` (backend limit 10 MB; nginx default 1 MB gave an HTML 413 page on
PDF uploads → "Unexpected token '<'" in the UI) and `proxy_read_timeout 180s` (OCR + AI), same as the container nginx.
