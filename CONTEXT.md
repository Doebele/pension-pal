# ch-pension-calc Context

**Hard Rule:** UI text must always be German (with correct umlauts); code and comments must be English.

## Projektzweck
`ch-pension-calc` ist eine Anwendung zur Berechnung und Szenarioanalyse der Schweizer Vorsorge (AHV, BVG, 3a/3b), inklusive Import-Workflows für Dokumentdaten.

## Projektstruktur
- `frontend/`: React + Vite UI
- `backend_python/`: FastAPI Backend (API, Persistenz, Import-Parser)
- `services_go/`: OCR Service
- `docker-compose.yml`: Startet DB, Backend, OCR, Web

## Lokales Setup (wichtig)
- Backend/API URL kommt aus `.env`: `VITE_API_BASE_URL=http://localhost:8002`
- `npm` Befehle für das Frontend müssen in `frontend/` laufen (nicht im Repo-Root).

## Startbefehle
```bash
cd <repo>
docker compose up -d

cd frontend
npm run dev -- --host 127.0.0.1 --port 4173
```

## AHV-Import (aktueller Stand)
- AHV-PDFs werden über einen spezialisierten Importflow verarbeitet.
- Parser erkennt Zeilen wie:
  - Jahr
  - Jahreseinkommen
  - Total
  - Alter
  - AHV Rente Anteil
- Zusatzmetadaten aus PDF:
  - Durchschnittseinkommen-Referenz
  - Total-Referenz
  - Difference-Table Preview
- UI:
  - Parse & Preview
  - Mapping Quelle -> Ziel
  - Zeilenvalidierung
  - Manuelle Korrektur
  - Übernahme nur bei eindeutiger Zuordnung (Duplikate gesperrt)

## Team-Konventionen
- **Kommentare:** Schreiben Sie Code-Kommentare auf Englisch, UI-Labels in der App auf Deutsch. Das Modell versteht technische Kommentare auf Englisch besser.
- **Error Handling:** Fügen Sie `.env`-bezogene Fehlerlogs in `CONSOLE.LOG` hinzu, damit das Modell Umgebungsprobleme schneller einordnen kann.
- **AI-Prompting:** Geben Sie bei AI-Aufrufen in Zed immer den exakten Dateipfad an (z. B. `/src/components/Knowledge.tsx`) statt nur „im Projekt ändern“.
- **Umlaute:** Verwenden Sie in UI-Texten und Dokumentation korrekte Umlaute (ä, ö, ü), sofern technisch möglich.

## Häufige Stolperfallen
- `npm ERR! enoent ... package.json`: Du bist nicht im `frontend/` Verzeichnis.
- `git pull origin main`: kann fehlschlagen, wenn kein `origin` Remote gesetzt ist.
- ZSH versucht unkommentierte Meta-Zeilen (z. B. mit Klammern) als Befehle zu interpretieren.

## Wichtige Dateien (Import)
- `backend_python/app/services/ahv_contribution_parser.py`
- `backend_python/app/routes/profile.py`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/components/cards/AhvCard.tsx`
- `frontend/src/components/cards/AhvContributionTable.tsx`
