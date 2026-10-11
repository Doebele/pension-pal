# Workflow Guidelines (Projektintern)

## 1) Pfad-Verifikation vor jeder Änderung

- Vor dem Edit immer den absoluten Zielpfad prüfen.
- Änderungen nur im GitHub-Projektverzeichnis durchführen: `Developer/github/ch-pension-calc`.
- Bei gleichnamigen Dateien in anderen Verzeichnissen zuerst den aktiven Arbeitsordner verifizieren.
- Nach Änderungen eine kurze Diff-/Status-Kontrolle im Projektverzeichnis durchführen.

## 2) Datenmodell-Änderungen

- Legacy-Felder nicht direkt entfernen, solange produktive Daten migriert werden müssen.
- Neue Struktur bevorzugen (`personal.property_details`), Legacy-Referenzen nur als Kompatibilitäts-Mapping zulassen.
- Import-Mapping (CSV/OCR/JSON) zentral halten und auf neue Feldpfade routen.

## 3) Wissensbasis-Erweiterung

- Neue fachliche Themen als Eintrag in `docs/wissen.md` dokumentieren.
- Jede Regel mit mindestens einer offiziellen Quelle belegen (Parlament, Fedlex, Bundesamt).
- Bei unklarer Rechtslage Annahmen im Eintrag markieren und zur fachlichen Klärung taggen.
