# Projektübergabe: PensionPal

Diese Vorlage ist für Projekte gedacht, die zwischen Claude Desktop, Zed, Cursor, Kimi und anderen Coding-Agenten wechseln. Sie hilft dabei, den Kontext knapp, wiederverwendbar und modellunabhängig zu halten.

---

## 1. Projekt auf einen Blick

**Projektname:** PensionPal (SwissPensionCalc)

**Kurzbeschreibung:** Schweizer Altersvorsorge-Planer (AHV/BVG/3a/3b, Abfindung, Vermögen) mit Analyse- und Monte-Carlo-Auswertung.

**Projektart:**
- Web-App

**Primäres Ziel:** Vorsorge-Daten erfassen (inkl. PDF-/CSV-Import mit OCR) und Renten-/Kapitalbedarf-Szenarien auswerten.

**Aktueller Status:**
- QA / Polishing

**Wichtigste Priorität in dieser Übergabe:** Design-System-Migration (Rail-Navigation, Tokens, i18n, Light/Dark) ist inhaltlich abgeschlossen — verbleibend ist die Übernahme der legacy `translations/de.json`-Inhalte (AnalysisInputs-Slider, Steuerübersicht) ins react-i18next-System.

---

## 2. Zielbild

PensionPal soll dieselbe Navigations-/Design-Logik wie das Schwesterprojekt `Doebele/application-pal` (bzw. `Doebele/fintools` für Chart-Farben und Toggle-Styling) haben: Rail-Navigation mit Collapse, Token-basiertes Design-System, Density-Modi (Komfort/Pro), Light-/Dark-Mode und DE/EN-Sprachumschaltung mit DB-Persistierung. Alle Eingabekarten (AHV, BVG, 3a, Lebensversicherung, Abfindung, Vermögen, Personal) sollen vollständig themefähig (Light/Dark) und zweisprachig (DE/EN) sein, mit denselben Segmented-Toggle-Komponenten wie die Rail-Sidebar.

---

## 3. Was bereits entschieden ist

### Produkt / Inhalt
- Zielgruppe: Schweizer Privatanwender zur Vorsorgeplanung (Demo-Charakter, keine Finanzberatung)
- Angebot / Produkt: Strukturierter Vorsorge-Flow (7 Eingabekarten) + Analyse/Szenarien + Monte-Carlo-Simulation
- Kernbotschaft: "Vereinfachte Schätzung – keine Finanzberatung"
- Haupt-CTA: Profil ausfüllen → Auswertung & Szenarien ansehen

### Design
- Gewünschte Stilrichtung: Dunkles Dashboard-UI (Tailwind/slate), jetzt mit vollwertigem Light-Mode
- Referenzen / Vorbilder: `Doebele/application-pal` (Rail-Navigation, Tokens), `Doebele/fintools` (Chart-Farben, Segmented-Toggle-Styling)
- Farben: CSS-Variablen-Tokensystem in `styles.css` (`--bg`, `--surface`, `--fg-1..3`, `--accent`, `--green/red/yellow`); Tailwind-Farbskalen (`slate`, `neutral`, `gray`, `emerald`, `rose`, `amber`, `blue`, `red`, `green`, `sky`, `indigo`, `cyan`, `lime`) sind in `tailwind.config.cjs` auf theme-aware RGB-Variablen umgemappt (dark = Tailwind-Default, light = gespiegelt)
- Typografie-Prinzip: keine Änderung am bestehenden Tailwind-Type-Scale
- No-Gos: keine neuen Tailwind-Farbskalen ohne Theme-Mapping; keine ad-hoc Tab/Chip-Styles mehr — immer `.seg-row`/`.seg-btn` (mit weißem Halo-Glow im Dark Mode, identisch zur Rail-Sidebar)

### Technik
- Stack: React 18 + Vite + TanStack Query + Tailwind CSS + Framer Motion (Frontend); FastAPI + SQLAlchemy 2.0 + PostgreSQL 16 (Backend)
- Framework / Library: `react-i18next` (i18n), `zustand` + `persist` (UI-Preferences-Store), `iconoir-react` (Icons, migriert von `lucide-react`), `round-flag-icons` (DE/EN-Flaggen)
- Styling-Ansatz: Tailwind + CSS-Variablen-Tokens, kein CSS-in-JS
- Deployment-Ziel: Docker (`docker-compose.dev.yml` lokal, `docker-compose.prod.yml` + GitHub Actions auf VPS `pensionpal.doebele.de`)
- Browser-/Gerätefokus: Desktop-Dashboard, kein expliziter Mobile-Fokus erkennbar

---

## 4. Source of Truth

- `README.md`: Stack, Domain, Secrets, OCR-Pipeline
- `masterplan.md` oder `project-brief.md`: diese Datei
- `AGENTS.md` / `CLAUDE.md`: **CLAUDE.md ist führend** für Architektur, Dev-Commands, Design-Tokens, i18n-Stand, API-Konventionen
- Design-Dateien / Figma / Penpot: keine, Referenz sind die Schwesterprojekte `application-pal`/`fintools`
- Komponenten-Doku: keine separate, Code in `frontend/src/components/` ist selbsterklärend
- API-Doku: keine separate, Routen in `backend_python/app/routes/`
- Sonstige wichtige Quellen: `docker-compose.dev.yml` / `docker-compose.prod.yml` (Laufzeit-Konfiguration)

**Regel:** Wenn Aussagen im Chat und in diesen Dateien widersprüchlich sind, gelten diese Dateien als führend.

---

## 5. Projektstruktur

```txt
pensionpal/
  backend_python/
    app/
      core/config.py          # Pydantic settings
      main.py                  # FastAPI app, CORS, startup DB init
      db.py                     # SQLAlchemy engine + Base
      models/                   # user.py, pension.py, documents.py
      routes/                   # profile.py, calc.py, imports.py
      services/                  # ocr.py, swissTax, profile_csv_import.py, ...
    tests/
  frontend/
    src/
      pages/                    # Dashboard, Analysis, MonteCarlo, ImportExport, Login, Knowledge
      components/
        cards/                   # AHV, BVG, 3a, LifeInsurance, Severance, Assets, Personal
        common/                   # DirtySaveButton, FileDropZone, DetailsAccordion, KnowledgeEntryLink
        layout/                   # Sidebar.tsx (Rail-Navigation)
        import/                   # GlobalImportZone, SelectTargetField
      store/uiPreferencesStore.ts # Zustand: theme/density/uiLanguage/railOpen
      i18n/                      # index.ts, de/common.json, en/common.json
      constants/chartColors.ts
      services/api.ts            # Fetch-Client mit Multi-Port-Fallback (8000/8001/8002)
    styles.css                    # Design-Tokens, .seg-row/.seg-btn, Farbskalen-Remapping
    styles/analysis-grid.css      # Allocation-Panel (Analysis-Seite)
    tailwind.config.cjs           # Farbskalen-Remapping auf CSS-Variablen
  docker-compose.dev.yml
  .claude/launch.json             # Preview-Server-Configs (frontend :5173, backend :8000)
```

**Wichtige Dateien:**
- Datei: `frontend/src/components/layout/Sidebar.tsx`
- Zweck: Rail-Navigation, UserAccountMenu-Popover (Konto wechseln/Abmelden), Density/Theme/Language-Toggles

- Datei: `frontend/styles.css`
- Zweck: Design-Tokens (dark/light), Farbskalen-Variablen, `.seg-row`/`.seg-btn`-Komponente

- Datei: `frontend/src/i18n/de|en/common.json`
- Zweck: Alle UI-Texte (Nav, Cards, Toasts, Analysis, Login, Monte Carlo, CSV-Modals) — Quelle für künftige Sprachen

---

## 6. Aktueller Stand

### Was funktioniert bereits?
- Rail-Navigation mit Collapse, Tooltips, Density/Theme/Language-Segmented-Toggles
- Light/Dark-Mode global (alle Karten, Analysis-Charts, Allocation-Panel)
- DE/EN-Übersetzung für: Rail, alle 7 Dashboard-Karten (inkl. AHV-Importdrawer, 3a Motion-Ettlin-Tab, Lebensversicherung-Importdrawer), Login, Monte Carlo, Import/Export + CSV-Modals, Analysis-Seite, Dashboard-Toasts
- Backend-Preferences-API (`GET /api/profile-state` liefert `preferences`-Block, `PUT /api/preferences`)
- Konto-Menü (UserAccountMenu) mit "Konto wechseln" / "Abmelden" im fintools-Stil
- Docker-Dev-Stack lokal lauffähig (Frontend :5173, Backend :8001→8000, Postgres :5432)

### Was ist nur teilweise gut?
- LifeInsurance- und AHV-Importdrawer wurden nur per Build + Code-Review verifiziert, nicht im laufenden Stack mit echten Backend-Daten durchgeklickt
- Kein TypeScript-Compiler lokal installiert (`vite build` ist SWC-only, kein echter Typecheck) — Verifikation lief über Build + Preview-Walkthrough

### Was funktioniert noch nicht?
- Legacy `frontend/translations/de.json`-Mechanismus (AnalysisInputs-Allocation-Panel, Analysis-Slider-Configs/Tooltips, STEUERÜBERSICHT-Block) ist noch nicht ins react-i18next-System migriert
- Knowledge-Artikelinhalte sind weiterhin nur Deutsch

### Bekannte Bugs / Schwächen
- War behoben in dieser Session: `VITE_API_BASE_URL` wurde versehentlich vom Produktions-`.env` überschrieben, weil Docker Compose das Root-`.env` immer mitlädt — jetzt in `docker-compose.dev.yml` hartcodiert auf `http://localhost:8001`

---

## 7. Nächste Aufgabe für den Agenten

**Konkrete Aufgabe jetzt:** Legacy `frontend/translations/de.json`-Mechanismus (AnalysisInputs-Allocation-Panel, Slider-Configs/Tooltips, STEUERÜBERSICHT) in `react-i18next` (`i18n/de|en/common.json`) migrieren.

**Erwartetes Ergebnis:** Auch dieser letzte Block ist zweisprachig (DE/EN) und folgt demselben i18n-Muster wie der Rest der App.

**Definition of Done:**
- Alle Strings aus `translations/de.json` haben ein EN-Pendant in `i18n/en/common.json`
- `AnalysisInputs.tsx` nutzt `useTranslation()` statt der alten Übersetzungsdatei
- Build (`npm run build`) läuft fehlerfrei, Preview-Walkthrough in DE und EN zeigt keine deutschen Reste

**Nicht tun:**
- Keine unnötigen Umbauten.
- Keine Änderung an bereits akzeptierten Designentscheidungen.
- Keine neuen Abhängigkeiten ohne Begründung.
- Keine Veränderungen außerhalb des betroffenen Bereichs.

---

## 8. Arbeitsregeln

### Inhaltlich
- Bestehende Entscheidungen respektieren.
- Erst verstehen, dann umbauen.
- Kleine, nachvollziehbare Änderungen bevorzugen.
- Bei Unklarheit konservativ vorgehen.

### Für Code
- Bestehenden Stil der Codebase respektieren.
- Änderungen möglichst lokal halten.
- Keine Logik duplizieren.
- Accessibility und Responsive-Verhalten mitdenken.
- Bei UI-Arbeit visuelle Konsistenz priorisieren.

### Für Webprojekte
- Keine generischen AI-Layouts erzeugen.
- Saubere Typografie und Spacing priorisieren.
- Mobile und Desktop beide prüfen.
- Bestehende Komponenten zuerst wiederverwenden.

---

## 9. Design- und Qualitätskriterien

Nutze diese Kriterien als Prüfliste.

### UX / UI
- Klare Hierarchie
- Gute Lesbarkeit
- Konsistenter visueller Rhythmus
- CTA ist eindeutig
- Kein überladenes Layout

### Frontend
- Responsiv
- Semantisches HTML
- Sauberes CSS / Designsystem-konform
- Gute States für Hover / Focus / Active
- Keine unnötigen Reflows oder Layout-Brüche

### Codequalität
- Verständliche Struktur
- Kleine Diff-Größe, wenn möglich
- Keine toten Pfade
- Kommentare nur dort, wo wirklich nötig

---

## 10. Offene Fragen

Nur Punkte eintragen, die wirklich ungeklärt sind.

- Soll der legacy `translations/de.json`-Mechanismus komplett entfernt werden, sobald die Migration abgeschlossen ist, oder bleibt er als Fallback bestehen?
- Gibt es einen geplanten Mobile-Breakpoint, oder bleibt die App Desktop-only?
- Soll ein TypeScript-Compiler (`tsc --noEmit`) als CI-Check ergänzt werden, da aktuell nur SWC-Build + Laufzeit-Verifikation existieren?

---

## 11. Übergabe an anderes Modell / anderes Tool

Diesen Block ausfüllen, wenn du von Claude Desktop nach Zed, Cursor, Kimi oder zurück wechselst.

**Bisher verwendet in:**
- Claude Desktop / Claude Code

**Was das letzte Tool zuletzt gemacht hat:**
Rail-Navigation, Design-Tokens, i18n (DE/EN) und Light/Dark-Mode für alle Eingabekarten + Analysis-Seite implementiert; Toggle-Switches auf einheitliches `.seg-row`/`.seg-btn`-Styling (mit Dark-Mode-Halo-Glow) umgestellt; Docker-Dev-Bug (`VITE_API_BASE_URL`-Überschreibung durch Root-`.env`) gefixt.

**Welche Dateien geändert wurden:**
- `frontend/styles.css`, `frontend/tailwind.config.cjs` (Tokens, Farbskalen-Remapping, `.seg-row`/`.seg-btn`)
- `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/App.tsx` (Rail-Navigation, UserAccountMenu)
- Alle Karten in `frontend/src/components/cards/`, `frontend/src/pages/*.tsx` (i18n + Toggle-Migration)
- `frontend/src/i18n/de/common.json`, `frontend/src/i18n/en/common.json` (alle UI-Texte)
- `docker-compose.dev.yml` (VITE_API_BASE_URL-Fix)
- `CLAUDE.md` (Doku aktualisiert)

**Was als Nächstes erwartet wird:**
Migration der legacy `translations/de.json`-Inhalte (AnalysisInputs-Allocation-Panel, Slider-Configs, STEUERÜBERSICHT) ins react-i18next-System.

**Worauf besonders geachtet werden soll:**
- Kein TypeScript-Compiler lokal installiert — Verifikation über `npm run build` + Preview-Walkthrough, nicht `tsc`.
- Neue Toggle-Komponenten immer über `.seg-row`/`.seg-btn`, nicht ad-hoc stylen.
- Neue UI-Texte immer in `i18n/de|en/common.json`, nicht als Inline-String.

---

## 12. Copy-Paste-Kurzbriefing

Diesen Block kannst du direkt in ein neues Tool oder Modell kopieren:

```md
Du übernimmst das Projekt PensionPal (Schweizer Altersvorsorge-Planer, React+Vite Frontend / FastAPI Backend).

Ziel des Projekts:
Vorsorge-Daten (AHV/BVG/3a/3b/Abfindung/Vermögen) erfassen und in Analyse-/Monte-Carlo-Szenarien auswerten.
Design-System-Migration (Rail-Navigation, Tokens, Light/Dark, DE/EN-i18n) ist weitgehend abgeschlossen.

Aktuelle Aufgabe:
Migriere den legacy `frontend/translations/de.json`-Mechanismus (AnalysisInputs-Allocation-Panel,
Slider-Configs, STEUERÜBERSICHT) ins react-i18next-System (`i18n/de|en/common.json`).

Wichtige Dateien / Source of Truth:
- CLAUDE.md (führend für Architektur, Dev-Commands, i18n-Stand)
- frontend/styles.css (Design-Tokens, .seg-row/.seg-btn)
- frontend/src/i18n/de|en/common.json (alle UI-Texte)
- frontend/src/components/AnalysisInputs.tsx + frontend/translations/de.json (noch zu migrieren)

Bereits entschieden:
- Tailwind-Farbskalen werden über CSS-Variablen theme-aware gemappt (tailwind.config.cjs), nicht pro Komponente.
- Alle Toggle-Switches nutzen .seg-row/.seg-btn/.active (identisch zur Rail-Sidebar, mit Dark-Mode-Halo-Glow).
- UI-Texte gehen in i18n/de|en/common.json, nicht in Inline-Strings.

Bitte beachten:
- Bestehende Struktur respektieren, kein TypeScript-Compiler lokal installiert (nur `vite build`/SWC).
- Vor Änderungen zuerst kurz den aktuellen Stand zusammenfassen.
- Nach Frontend-Änderungen: `npm run build` + Preview-Walkthrough (Light/Dark, DE/EN) statt nur Code-Review.
```

---

## 13. Empfohlene Nutzung in deinem Workflow

### Wenn du in Claude Desktop startest
Nutze diese Vorlage als `project-brief.md` oder `masterplan.md`, damit spätere Sessions leichter fortgesetzt werden können.

### Wenn du in Zed oder Cursor weiterarbeitest
Lege den Inhalt zusätzlich als `AGENTS.md` oder `CLAUDE.md` im Projekt ab, damit der Editor-Agent die Regeln direkt kennt.

### Wenn du mit Kimi oder GLM weitergehst
Kopiere vor allem die Abschnitte „Source of Truth“, „Aktueller Stand“, „Nächste Aufgabe“ und „Copy-Paste-Kurzbriefing“ in die neue Session.

---

## 14. Mini-Version für schnelle Übergaben

```md
Projekt: PensionPal
Ziel: Schweizer Altersvorsorge-Planer mit Analyse/Monte-Carlo-Auswertung
Stand: Rail-Navigation, Tokens, Light/Dark, DE/EN-i18n für App weitgehend fertig; legacy translations/de.json noch offen
Aktuelle Aufgabe: AnalysisInputs/translations-de.json ins react-i18next-System migrieren
Wichtige Dateien: CLAUDE.md, frontend/styles.css, frontend/src/i18n/de|en/common.json
Schon entschieden: .seg-row/.seg-btn für alle Toggles, theme-aware Tailwind-Farbskalen, i18n statt Inline-Strings
Nicht ändern: Bestehende Design-Tokens und Rail-Navigation-Struktur
Offene Frage: Legacy-Mechanismus komplett entfernen oder als Fallback behalten?
```

