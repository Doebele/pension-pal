#!/usr/bin/env python3
"""Holt die Steuern auf Kapitalleistungen aus Vorsorge (2. Säule, 3a) von der ESTV.

Quelle: offizieller Steuerrechner der Eidgenössischen Steuerverwaltung
(https://swisstaxcalculator.estv.admin.ch), Rechner "Kapitalauszahlung". Abgefragt werden
die 26 Kantonshauptorte für ein Betragsraster, alleinstehend und verheiratet, ohne
Konfession. Das Ergebnis (Bund, Kanton, Gemeinde je Betrag) landet in
frontend/src/data/capitalTaxTables.json; die App interpoliert zwischen den Rasterpunkten.

Jährlich neu laufen lassen, sobald die ESTV das neue Steuerjahr freigibt:
    python3 scripts/fetch-capital-tax-tables.py            # neuestes verfügbares Jahr
    python3 scripts/fetch-capital-tax-tables.py 2026       # bestimmtes Jahr
"""
import json
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

API = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
GROUP_CAPITALS = 88  # die 26 Kantonshauptorte
RELATIONSHIPS = {"single": 1, "married": 2}
CONFESSION_NONE = 4
AGE_AT_PAYMENT = 65
# Raster so dicht, dass die Progression zwischen den Punkten gut linear angenähert ist
AMOUNTS = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000,
           500_000, 600_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 3_000_000]
OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "capitalTaxTables.json"


def call(operation: str, payload: dict):
    request = urllib.request.Request(
        f"{API}/{operation}", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)["response"]


def main() -> None:
    year = int(sys.argv[1]) if len(sys.argv) > 1 else call("API_getTaxYearRange", {"Calculator": 2})["MaxYear"]
    cantons: dict[str, dict] = {}
    for relationship, relationship_id in RELATIONSHIPS.items():
        for amount in AMOUNTS:
            rows = call("API_calculateManyCapitalTaxes", {
                "SimKey": None, "TaxYear": year, "TaxGroupID": GROUP_CAPITALS,
                "Relationship": relationship_id, "Confession1": CONFESSION_NONE,
                "Confession2": CONFESSION_NONE if relationship == "married" else 0,
                "NumberOfChildren": 0, "Gender": 1, "AgeAtPayment": AGE_AT_PAYMENT, "Capital": amount,
            })
            for row in rows:
                location = row["Location"]
                canton = cantons.setdefault(location["Canton"], {
                    "municipality": location["BfsName"] or location["City"], "single": [], "married": [],
                })
                canton[relationship].append({
                    "amount": amount,
                    "federal": row.get("TaxFed", 0),
                    "cantonal": row.get("TaxCanton", 0),
                    "municipal": row.get("TaxCity", 0),
                })
            time.sleep(0.3)  # das ESTV-System schonen
        print(f"{relationship}: {len(AMOUNTS)} Beträge × {len(cantons)} Kantone")

    if len(cantons) != 26:
        sys.exit(f"Erwartet 26 Kantone, erhalten {len(cantons)} — nichts geschrieben")
    OUT.write_text(json.dumps({
        "source": "ESTV Steuerrechner, Kapitalauszahlung aus Vorsorge (swisstaxcalculator.estv.admin.ch)",
        "taxYear": year,
        "fetchedAt": date.today().isoformat(),
        "assumptions": "Kantonshauptort, ohne Konfession (keine Kirchensteuer), keine Kinder, Auszahlung mit 65",
        "amounts": AMOUNTS,
        "cantons": dict(sorted(cantons.items())),
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"geschrieben: {OUT} (Steuerjahr {year})")


if __name__ == "__main__":
    main()
