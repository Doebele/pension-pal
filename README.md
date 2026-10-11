# PensionPal

Containerized Swiss pension planning platform (AHV/BVG/3a/3b) with OCR document import,
multi-scenario analysis, and Monte Carlo simulations.

**Live:** [pensionpal.doebele12.de](https://pensionpal.doebele12.de)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + Framer Motion |
| Backend | FastAPI (Python 3.12) + SQLAlchemy 2.0 |
| Database | PostgreSQL 16 |
| OCR | pdfplumber + pytesseract + Mistral OCR API |
| AI field extraction | Per-user choice: LM Studio, Ollama or 16 cloud providers (Anthropic, OpenAI, Gemini, Mistral, OpenRouter, …) |
| Deployment | Docker Compose + GitHub Actions → Strato VPS |

## Project Structure

```text
.
├── Dockerfile                          # Frontend (React) image
├── docker-compose.dev.yml              # Local development stack
├── docker-compose.prod.yml             # Production stack
├── deploy.sh                           # Deploy script with rollback
├── .github/workflows/deploy.yml        # CI/CD pipeline
├── frontend/                           # React + Vite app
│   └── src/components/settings/        # SettingsModal (AI models), SettingsBackupModal
├── backend_python/                     # FastAPI backend
│   ├── app/
│   │   ├── services/ocr.py             # pdfplumber + pytesseract + Mistral OCR (+ AI field extraction)
│   │   ├── services/ai.py              # AI provider adapter (Anthropic + OpenAI-compatible)
│   │   ├── routes/ai.py                # /api/ai-settings, /api/ai/test
│   │   ├── services/ahv_contribution_parser.py
│   │   ├── services/life_insurance_import_parser.py
│   │   └── routes/imports.py
│   ├── Dockerfile
│   └── requirements.txt
└── deployment-config/
    ├── strato-vps.env                  # Production env template
    ├── nginx-docker-entrypoint.sh
    └── nginx/default.conf.template
```

## Local Development

```bash
cp .env.example .env
# Edit .env and set MISTRAL_API_KEY (optional)
docker compose -f docker-compose.dev.yml up --build
```

Services:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:8001](http://localhost:8001)
- PostgreSQL: `localhost:5432`

## OCR Pipeline

Document extraction uses a 3-tier fallback strategy:

1. **Mistral OCR API** (`mistral-ocr-latest`) — best quality, requires `MISTRAL_API_KEY`
2. **pdfplumber** — fast text extraction for selectable PDFs
3. **pytesseract** — fallback for scanned PDFs and images (German/French/English)

Supported document types: AHV statements, BVG pension fund statements, life insurance policies, asset CSVs.

For BVG and life insurance documents, regex patterns fill the fields first. If the user has configured an
AI model (see below), the extracted text is then sent to that model, and every field it finds overrides the
regex value (`confidence 0.95`, `source_pattern "ai:<model>"`). Any AI error keeps the regex result — the
import never fails because of the AI.

## Payout Planning (Analysis → Bezugsplanung)

Pension fund as annuity, lump sum or mix (0/25/50/75/100 % capital), each 3a account paid out in its own year
(from reference age − 5, up to reference age + 5 only while working), life insurance (3b) as capital or annuity at
maturity. Paid-out capital is invested at a chosen return and drawn down in constant real terms so it lasts until the
target age. Shows monthly income per age (today's francs), invested wealth over time, a pension-fund variant table
(0/50/100 % capital) and the tax saving from staggering 3a payouts.

**Capital withdrawal tax** (2nd pillar + 3a, summed per calendar year, taxed separately and progressively) comes from
the **official ESTV tax calculator** for all 26 cantonal capitals (federal + cantonal + municipal, no church tax),
single and married, on a grid of 18 amounts; values in between are interpolated. Data:
`frontend/src/data/capitalTaxTables.json`; refresh once a year when ESTV publishes the new tax year:

```bash
python3 scripts/fetch-capital-tax-tables.py        # latest year available at ESTV
```

**Investment buckets and Monte Carlo:** invested capital is split across buckets (account, strategy funds
conservative/balanced/growth, equity ETF world, custom), each with share, return, volatility and TER (defaults are
long-term assumptions, deliberately below recent historical returns). Portfolio return = weighted net return,
volatility with a single correlation of 0.7 between buckets. 1000 simulated market paths (lognormal, seeded) give a
10–90 % wealth band, the probability that the planned draw lasts to the target age and the **safe monthly draw**
that lasts in 90 % of paths. The income chart and the wealth overview of the Analysis use the payout plan.

**Comparison with the Swiss median and early retirement:** a table for retirement at 60–66 (AHV from 63 at the
earliest, −6.8 % per year early; conversion rate −5 % per year; pension fund assets shifted by the yearly retirement
credit; 3a payouts shifted by the same years) with monthly net income (plan and safe draw) and the gap to the
median, with and without drawing down capital. Median lines in the income charts (disposable income of people 65+,
BFS SILC 2018: CHF 44,899 per year, couples × 1.5) and wealth charts (median free wealth by age, LUSTAT tax data
Lucerne 2020, up to 74). Figures and sources are the same as in Budget-Pal (`frontend/src/services/swissMedians.ts`).

Logic: `frontend/src/services/payoutPlanning.ts` (self-check `npm run check:payout`, also in CI);
UI: `frontend/src/components/analysis/PayoutPlanningSection.tsx`. Settings are saved with the analysis state
(`analysis_state.payoutPlan`).

## Accounts, Profile & Password Reset

Same logic and UI as Budget-Pal and Fintools:

- **Sign in** with username **or** email plus password (existing accounts with a short PIN keep working).
  Wrong password and unknown account return the same error, so nobody can probe for accounts.
- **Register** with username, email, a password of at least 8 characters and an **invite code** (as in Fintools):
  every signed-in user creates one-time codes under Einstellungen → Profil → Einladungen (6 characters without
  look-alikes, valid 7 days, max. 10 open) and shares them as `https://…/?invite=CODE` links, which open the
  registration with the code filled in. The code is checked before anything else (uninvited callers learn nothing
  about existing names) and consumed in the same transaction as the new account. Only the very first account of an
  empty database registers without a code.
- **Passkeys** (as in Budget-Pal): "Mit Passkey anmelden" on the login screen (Face ID, Touch ID, Windows Hello,
  security keys). Added under Einstellungen → Sicherheit with the current password (a stolen session alone can't add
  one) and announced by an info mail. User verification is required, challenges live 5 minutes in the database and
  are single use, and "forgot password" removes every passkey of the account. Passkeys are bound to the domain:
  production sets `WEBAUTHN_RP_ID=pensionpal.doebele12.de` and `WEBAUTHN_ORIGINS_RAW=https://pensionpal.doebele12.de`
  in `docker-compose.prod.yml`; locally `localhost` / `http://localhost:5173`.
- **Profile** (account menu → Einstellungen → Profil): change username and email. A new email needs the
  current password, because the email decides where reset links go.
- **Change password** (same tab): needs the current password; every *other* device is signed out.
- **Forgot password**: always answers the same, whether or not the address exists. The mail contains a link
  `https://…/reset-password#token=…` that is valid for **30 minutes** and works **once**. Only the SHA-256 of the
  token is stored; the token travels in the URL fragment (never in server logs or `Referer`) and links are built
  from `APP_BASE_URL`, never from the request's Host header. Setting the new password signs out every device.
- **Rate limits** per IP and per address/user on login, register, forgot, reset and change.

Mail goes out through the **no-reply mailbox on Strato** (`noreply@doebele12.de`, same as Budget-Pal) via plain
SMTP (`services/mailer.py`). Configuration:

| Where | What |
|-------|------|
| Production | `deployment-config/smtp.env` on the VPS (git-ignored, **not** in `STRATO_ENV_FILE`): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. `APP_BASE_URL` is set in `docker-compose.prod.yml`. |
| Local | `.env` (see `.env.example`). Without `SMTP_HOST` no mail is sent and the full mail incl. link is written to the backend log. |

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/register` | `{display_name, email, pin}` |
| `POST` | `/api/auth/login` | `{display_name, pin}` — `display_name` may also be the email |
| `GET/PUT` | `/api/auth/me` | Own profile `{display_name, email}`; email change needs `current_password` |
| `POST` | `/api/auth/password/change` | `{current_password, new_password, lang}` |
| `POST` | `/api/auth/password/forgot` | `{email, lang}` → always `202` |
| `POST` | `/api/auth/password/reset` | `{token, new_password, lang}` |
| `GET/POST` | `/api/auth/invites` | Own invite codes / create one |
| `DELETE` | `/api/auth/invites/{code}` | Revoke an unused own code |
| `POST` | `/api/auth/webauthn/register/options` · `/register/verify` | Add a passkey (options need `{password}`) |
| `POST` | `/api/auth/webauthn/login/options` · `/login/verify` | Sign in with a passkey |
| `GET/DELETE` | `/api/auth/webauthn/credentials[/{id}]` | List / remove own passkeys |

## AI Models (Settings → Document Import)

Each user picks their own model under **account menu → Einstellungen** (same integration as Fintools):

- **Providers:** LM Studio and Ollama (local, no key) plus Anthropic, OpenAI, Google Gemini, xAI, Meta,
  Mistral, DeepSeek, Alibaba Qwen, Kimi Platform, Kimi Code, Z.AI (global/China), MiniMax, Xiaomi MiMo,
  StepFun and OpenRouter. The list lives in `AI_PROVIDERS` in `frontend/src/components/settings/SettingsModal.tsx`;
  an OpenAI-compatible provider needs only a new entry there.
- **Per-provider profiles:** endpoint, API key and model are remembered per provider, so switching back
  restores them. The dropdown marks providers with ✓ (connection tested) or 🔑 (key stored).
- **Test connection** validates endpoint + key, loads the provider's model list into a dropdown and, if a
  model is selected, sends a one-word test prompt (shows latency).
- **Local models in Docker:** the backend rewrites `localhost` → `host.docker.internal`, so LM Studio/Ollama
  on the host work from the dev stack (`extra_hosts` is set in `docker-compose.dev.yml`).
- **Timeouts:** AI extraction may take up to 170 s (local reasoning models); nginx allows 180 s on `/api/`.

### Settings backup

**Import / Export → ⚙️ Einstellungen sichern** downloads a JSON file
(`{ format: "pension-pal-settings", version: 1, settings: { preferences, ai } }`) with theme, language, density
and every AI provider including its API key, and restores it on another account or instance.

> ⚠️ The backup contains API keys in **plain text**. Store it safely. Files named `pension-pal-settings_*.json`
> are git-ignored so a backup saved inside the project folder cannot be committed by accident.

API endpoints (all require the `X-User-Id` + `X-Session-Token` session headers):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ai-settings` | Current user's AI settings (incl. keys — own account only) |
| `PUT` | `/api/ai-settings` | Save settings (validated; endpoint policy enforced) |
| `POST` | `/api/ai/test` | List models and optionally ping the selected model |

## Production Deployment (Strato VPS)

The app runs at `pensionpal.doebele12.de` alongside `fintools.doebele12.de` on the same VPS.
Internal port `127.0.0.1:18080` is routed by the host Nginx reverse proxy, which also terminates TLS.

### Nginx reverse proxy config (host)

`/etc/nginx/sites-available/pensionpal` — the `listen 443`/`ssl_*` lines are managed by Certbot:

```nginx
server {
    listen 80;
    server_name pensionpal.doebele12.de;

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/pensionpal.doebele12.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pensionpal.doebele12.de/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

### TLS certificate (Let's Encrypt)

The certificate for `pensionpal.doebele12.de` is issued by Certbot on the host and renewed automatically by
`certbot.timer` (same setup as `fintools.doebele12.de`). Private keys stay in `/etc/letsencrypt/` on the VPS —
never in the repository.

```bash
certbot certificates                                        # status / expiry
certbot renew --dry-run --cert-name pensionpal.doebele12.de # test renewal (waits ~4 min random delay)
certbot --nginx -d pensionpal.doebele12.de --redirect       # enable HTTP → HTTPS redirect
```

The frontend is built with the same-origin API base `VITE_API_BASE_URL=/api` (build-arg in
`.github/workflows/deploy.yml`). An absolute `http://…/api` URL would be blocked as mixed content on the HTTPS
page — keep it relative.

### Manual deployment

```bash
ssh <user>@<vps-host>
cd <deploy-path>
bash ./deploy.sh deployment-config/strato-vps.env docker-compose.prod.yml
```

## GitHub Actions CI/CD

Workflow: `.github/workflows/deploy.yml`

**Triggers:** `push` on `main` · `pull_request` · manual (`workflow_dispatch`)

**Pipeline:**

1. Frontend build + backend tests (`PYTHONPATH=. pytest -q`)
2. Build and push Docker images to GHCR:
   - `ghcr.io/doebele/pension-pal/web`
   - `ghcr.io/doebele/pension-pal/backend`
3. Deploy via SSH to Strato VPS with automatic rollback on failure

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `STRATO_HOST` | VPS IP address or host name |
| `STRATO_USER` | SSH user (`root`) |
| `STRATO_SSH_KEY` | Private SSH key for VPS access |
| `STRATO_PORT` | SSH port (`22`) |
| `STRATO_DEPLOY_PATH` | Deploy path on the VPS |
| `STRATO_REPO_SSH_URL` | HTTPS clone URL (`https://github.com/Doebele/pensionpal.git`) |
| `STRATO_ENV_FILE` | Full contents of production env file |
| `GH_PAT` | GitHub Personal Access Token (repo: read, Contents: read-only) |

### Production env file (`STRATO_ENV_FILE` secret)

```env
APP_ENV=production
NODE_ENV=production
PORT=3000

POSTGRES_DB=pension_pal
POSTGRES_USER=pension_pal
POSTGRES_PASSWORD=<your-password>
DATABASE_URL=postgresql://pension_pal:<your-password>@db:5432/pension_pal

SECRET_KEY=<openssl rand -hex 32>
ACCESS_TOKEN_EXPIRE_MINUTES=120

MISTRAL_API_KEY=<your-mistral-api-key>

DOCKER_REGISTRY=ghcr.io/doebele/pension-pal
IMAGE_TAG=latest

PUBLIC_DOMAIN=pensionpal.doebele12.de
APP_BIND_IP=127.0.0.1
APP_HTTP_PORT=18080
VITE_API_BASE_URL=/api
```

## Security

- `.env` and private keys are excluded via `.gitignore`
- GHCR images are public (read-only pull without auth)
- Docker containers run on isolated internal network
- Host binding defaults to `127.0.0.1` (not exposed publicly)
- Use a long random `SECRET_KEY` (`openssl rand -hex 32`)
- TLS via Let's Encrypt on the host nginx (see above); certificates and private keys never enter the repository
- `deployment-config/strato-vps.env` is tracked **as a template with placeholders only**; real values live in
  the `STRATO_ENV_FILE` GitHub secret. Never commit real keys there.
- **AI API keys** are never stored in the repository or in env files. Each user enters their own key in the UI;
  it is stored per user in the database (`person_profiles.ai_settings`, plain text — same model as Fintools)
  and only returned to that user's authenticated session.
- AI settings are deliberately kept out of `/api/profile-state`, which feeds the CSV export — **API keys never
  appear in a CSV export**, only in the explicit settings backup (see above).
- **SSRF protection:** the server calls the AI endpoint a user enters. In production (`APP_ENV=production`,
  open registration) only public `https` hosts are accepted — no LM Studio/Ollama, no internal/private IPs.
  Checked on save, on connection test and again on every import.
- **Transport:** API keys travel from the browser to the backend, so the app must be used over **HTTPS** (see
  *TLS certificate*). Keep `VITE_API_BASE_URL` relative and enable the HTTP → HTTPS redirect on the host.

## Ops

```bash
# Check running containers
ssh <user>@<vps-host> "docker ps"

# Tail logs
ssh <user>@<vps-host> "docker logs pension_pal_backend -f"

# Restart nginx (after IP changes)
ssh <user>@<vps-host> "docker restart pension_pal_nginx"

# Manual redeploy
ssh <user>@<vps-host> "cd <deploy-path> && bash deploy.sh deployment-config/strato-vps.env docker-compose.prod.yml"
```

### Database backups

`scripts/backup-db.sh` dumps the production database to `<deploy-path>/backups/` (gzip, root-only, git-ignored).
A dump is only kept if `pg_dump` completed; dumps older than 14 days are deleted. It runs nightly at 03:15 UTC
from root's crontab on the VPS (next to Budget-Pal's backup at 03:00):

```cron
15 3 * * * <deploy-path>/scripts/backup-db.sh nightly >> /var/log/pensionpal-backup.log 2>&1
```

```bash
# Backup now / list / last runs
ssh <user>@<vps-host> "<deploy-path>/scripts/backup-db.sh manual"
ssh <user>@<vps-host> "ls -lh <deploy-path>/backups; tail -5 /var/log/pensionpal-backup.log"

# Off-site copy to the Mac (the dumps live on the same server as the database)
scp "<user>@<vps-host>:<deploy-path>/backups/pensionpal_*.sql.gz" ~/Backups/pensionpal/

# Restore (overwrites data!)
gunzip -c backups/<file>.sql.gz | docker exec -i pension_pal_db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```
