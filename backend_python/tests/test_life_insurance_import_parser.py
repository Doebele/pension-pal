from app.services.life_insurance_import_parser import parse_life_insurance_pdf_import


def test_parse_life_insurance_pdf_import_extracts_ergo_like_fields(monkeypatch):
    class _Page:
        def extract_text(self):
            return (
                "ERGO Lebensversicherung\n"
                "Versicherungsnummer: T 1234567\n"
                "Versicherte Person: Max Muster\n"
                "Garantiertes Erlebensfallkapital: CHF 125'000\n"
                "Jährliche Beiträge: CHF 3'600\n"
                "Rückkaufswert: CHF 42'000\n"
                "Todesfallkapital: CHF 110'000\n"
                "Ablaufdatum: 01.09.2042\n"
            )

        def extract_tables(self):
            return []

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.life_insurance_import_parser.pdfplumber.open", lambda _: _Pdf())

    parsed = parse_life_insurance_pdf_import(b"%PDF-1.4")
    fields = {item["id"]: item["value"] for item in parsed["fields"]}
    assert fields["insurer"] == "ERGO"
    assert fields["policyNumber"] == "T 1234567"
    assert fields["insuredName"] == "Max Muster"
    assert fields["capitalPayoutAtMaturity"] == "125000.0"
    assert fields["annualPremium"] == "3600.0"
    assert fields["surrenderValue"] == "42000.0"
    assert fields["sumAtDeath"] == "110000.0"
    assert fields["maturityDate"] == "01.09.2042"


def test_parse_life_insurance_pdf_import_adds_missing_value_issues(monkeypatch):
    class _Page:
        def extract_text(self):
            return (
                "Swiss Life\n"
                "Versicherungsnummer: X-99\n"
                "Garantiertes Erlebensfallkapital: CHF 100'000\n"
                "Jährliche Beiträge: CHF 2'400\n"
            )

        def extract_tables(self):
            return []

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.life_insurance_import_parser.pdfplumber.open", lambda _: _Pdf())

    parsed = parse_life_insurance_pdf_import(b"%PDF-1.4")
    issue_codes = {item["code"] for item in parsed["issues"]}
    assert "MISSING_OPTIONAL_VALUE" in issue_codes



def _text_pdf(monkeypatch, text):
    class _Page:
        def extract_text(self):
            return text

        def extract_tables(self):
            return []

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.life_insurance_import_parser.pdfplumber.open", lambda _: _Pdf())


def test_real_world_layouts(monkeypatch):
    _text_pdf(monkeypatch, (
        "Swiss Life AG\n"
        "Policennummer: 1234567.8\n"
        "Versicherungsnehmer: Max Muster\n"
        "Garantiertes Erlebensfallkapital CHF 50'000.00\n"
        "Rückkaufswert per 31.12.2024: CHF 12'345.60\n"
        "Jährliche Rente CHF 4'800\n"
        "Ablaufdatum 01.04.2035\n"
    ))
    fields = {f["id"]: f for f in parse_life_insurance_pdf_import(b"%PDF-1.4")["fields"]}
    assert fields["policyNumber"]["value"] == "1234567.8"
    assert fields["insuredName"]["value"] == "Max Muster"
    assert fields["capitalPayoutAtMaturity"]["value"] == "50000.0"
    assert fields["surrenderValue"]["value"] == "12345.6"  # "per <Datum>" between label and amount
    assert fields["annualPensionChf"]["value"] == "4800.0"
    assert fields["maturityDate"]["value"] == "01.04.2035"


def test_german_number_format_and_no_fake_confidence(monkeypatch):
    _text_pdf(monkeypatch, (
        "ERGO Lebensversicherung\n"
        "Versicherte Person: Erika Beispiel\n"
        "Erlebensfallkapital: 1.234,50 EUR\n"
        "Jahresprämie: 600,00 EUR\n"
    ))
    fields = {f["id"]: f for f in parse_life_insurance_pdf_import(b"%PDF-1.4")["fields"]}
    assert fields["insuredName"]["value"] == "Erika Beispiel"
    assert fields["capitalPayoutAtMaturity"]["value"] == "1234.5"
    assert fields["annualPremium"]["value"] == "600.0"
    assert fields["currency"]["value"] == "EUR"
    assert fields["sumAtDeath"]["value"] == "" and fields["sumAtDeath"]["confidence_score"] == 0.0


def test_ai_fills_gaps_and_unknown_insurer_falls_back(monkeypatch):
    from app.services import ai as ai_service

    _text_pdf(monkeypatch, "Helvetia Leben\nIhre Police im Überblick, Erlebensfall siehe Seite 2\n" * 3)
    monkeypatch.setattr(ai_service, "chat", lambda *a, **k: ('{"insurer": "Helvetia", "capitalPayoutAtMaturity": 75000}', "m"))
    ai = {"provider": "openai", "endpoint": "https://api.openai.com/v1", "model": "m", "key": "k"}
    fields = {f["id"]: f for f in parse_life_insurance_pdf_import(b"%PDF-1.4", ai=ai)["fields"]}
    assert fields["capitalPayoutAtMaturity"]["value"] == "75000"
    assert fields["insurer"]["value"] == "Weitere"  # not a card option


def test_ergo_layout_mac_roman_umlauts_and_half_yearly_premium(monkeypatch):
    # As extracted by pdfplumber from an ERGO policy: umlauts as (cid:N) of a MacRoman font
    _text_pdf(monkeypatch, (
        "ERGO Lebensversicherung AG\n"
        "Ab 01.01.2026 erh(cid:154)ht sich der Beitrag auf halbj(cid:138)hrlich 7.225,39 EUR; die\n"
        "garantiertes Todesfallkapital 333.884,00 EUR\n"
        "R(cid:159)ckkaufswert einschlie§lich (cid:134)berschussanteile 291.806,88 EUR\n"
        "garantiertes Erlebensfallkapital am Ende der\n"
        "Abrufphase 481.540,00 EUR\n"
        "bei Ablauf zum 01.12.2033 481.540,00 EUR\n"
    ))
    fields = {f["id"]: f["value"] for f in parse_life_insurance_pdf_import(b"%PDF-1.4")["fields"]}
    assert fields["surrenderValue"] == "291806.88"
    assert fields["annualPremium"] == "14450.78"  # half-yearly × 2
    assert fields["capitalPayoutAtMaturity"] == "481540.0"
    assert fields["sumAtDeath"] == "333884.0"
    assert fields["maturityDate"] == "01.12.2033"
    assert fields["currency"] == "EUR"
