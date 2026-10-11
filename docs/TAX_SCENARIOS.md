# TAX_SCENARIOS

## Hypothekentilgung aus BVG (2. Saeule)

### Kontext Schweiz (vereinfachte Fachhinweise)
- Vorbezug aus der beruflichen Vorsorge fuer selbstgenutztes Wohneigentum kann steuerlich privilegiert behandelt werden (separate Kapitalleistungsbesteuerung statt ordentlicher Einkommenssteuerlogik).
- Die Entnahme reduziert das verfuegbare BVG-Alterskapital und damit die spaetere BVG-Rente (Umwandlungssatz wirkt auf ein kleineres Kapital).
- AHV-Vollrente wird durch diese BVG-Entnahme nicht direkt reduziert, bleibt aber im Gesamtnetto relevant, weil die zweite Saeule sinkt.

### Modellannahme in SwissPensionCalc
- Parameter: `bvg_mortgage_repayment_amount_per_year` (CHF/Jahr) oder alternativ Gesamtentnahme.
- Wirkung: jaehrlicher Kapitalabzug bis zum Rentenalter, danach Umwandlung in monatliche Rente.
- Ausgabe: Vergleich "Standard BVG-Rente" vs. "BVG-Rente mit Tilgung" inkl. `netto_rentenverhaeltnis`.

### Compliance-Hinweis
- Die Berechnung dient als Entscheidungsunterstuetzung und ersetzt keine individuelle Steuer- oder Vorsorgeberatung.
