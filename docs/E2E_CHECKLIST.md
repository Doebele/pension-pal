# E2E Checkliste (UI/State)

## 1) Säule 3a: Radio-Buttons Kontenanzahl

- Öffne `Säule 3A` -> Tab `Auszahlungsoptionen`.
- Wähle nacheinander `Ein Konto`, `Zwei Konten`, `Drei Konten`.
- Prüfe: Anzahl Konto-Eingabeblöcke passt sich sofort auf 1/2/3 an.
- Erwartung: Keine Überlappung auf Mobile (unter `sm` vertikal).

## 2) Vermögensübersicht: Konto-Typ Dropdown

- Öffne `Vermögensübersicht` -> Tab `Privatvermögen`.
- Füge eine neue Zeile hinzu.
- Prüfe: Konto-Typ ist standardmässig auf `Bankkonto`.
- Wechsle den Typ (z. B. `Depot`, `Säule 3a Konto`) und speichere.

## 3) Save/Reload Persistenz

- Erfasse mindestens eine Zeile mit Betrag, Währung und Kontotyp.
- Klicke `Speichern`, lade die Seite neu.
- Prüfe: Kontotyp, Betrag und Währung bleiben erhalten.

## 4) Import-Mapping Preview

- Importiere eine Datei und öffne die Import-Vorschau.
- Wenn ein Feld technisch `bank` oder `cash` enthält:
  - Prüfe: Anzeige ist menschenlesbar (`Bankkonto`, `Bargeld`) statt technischem Code.
- Übernimm Zuordnung und prüfe danach gespeicherte Werte in der Tabelle.

## 5) Navigation stabil (kein Reset)

- Folge Klickpfad: Sidebar -> kleine Kachel rechts -> Wizard-Schritt.
- Führe dazwischen Reload aus.
- Prüfe: Aktive Kachel bleibt konsistent, kein unerwarteter Sprung auf `Persönliche Angaben`.
