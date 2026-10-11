# Wissen: Quellenbasierte Fachnotizen

## Vorlage für neue Themen

- **Thema:** Kurzbezeichnung des Themas
- **Relevanz im Dashboard:** Welche Berechnung, Karte oder Entscheidung betroffen ist
- **Regel/Parameter:** Konkrete, umsetzbare Parameter (mit Einheit und Gültigkeit)
- **Annahmen im Produkt:** Welche Annahmen im Code getroffen wurden
- **Offene Punkte:** Was fachlich noch geklärt werden muss
- **Quellen (verifiziert):**
  - Offizielle Primärquelle (Bund/Fedlex/Parlament)
  - Optional: Kantonale Vernehmlassung oder Vollzugshinweise

## Beispiel: Motion Ettlin (Säule 3a, nachträgliche Einkäufe)

- **Thema:** Umsetzung Motion Ettlin zu nachträglichen Einkäufen in die Säule 3a
- **Relevanz im Dashboard:** Karte `Säule 3A`, Tab `Motion Ettlin / Spezifikation`
- **Regel/Parameter (fachlich):**
  - Nachträgliche Einkäufe sind nur innerhalb der regulatorischen Bedingungen zulässig.
  - Für Plausibilisierung im Produkt sind insbesondere Erwerbseinkommen, Beitragsjahre und Bezugsstatus relevant.
- **Annahmen im Produkt:**
  - UI kennzeichnet Jahre als `completed`/`open`; fachliche Zulässigkeit wird separat geprüft.
  - Steuerliche Wirkung wird als Modellwert angezeigt, nicht als verbindliche Steuerveranlagung.
- **Offene Punkte:**
  - Exakte kantonale Ausprägungen (falls vorhanden) müssen separat versioniert werden.
- **Quellen (verifiziert):**
  - Schweizer Parlament (Geschäft 19.3702): <https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId=20193702>
  - Fedlex, BVV 3 (SR 831.461.3): <https://www.fedlex.admin.ch/eli/cc/1985/1771_1771_1771/de>
  - Beispiel Vernehmlassungs-Kontext (Kanton St. Gallen): <https://www.sg.ch/news/sgch_aussenbeziehungen/2024/02/aenderung-der-verordnung-ueber-die-steuerliche-abzugsberechtigun.html>
