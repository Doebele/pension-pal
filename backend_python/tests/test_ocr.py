from app.services.ocr import detect_document_type, extract_fields, parse_amount


def test_parse_amount_formats():
    assert parse_amount("CHF 1'234.50") == 1234.5
    assert parse_amount("1’234") == 1234
    assert parse_amount("1 234.05") == 1234.05
    assert parse_amount("1.234,50") == 1234.5
    assert parse_amount("12.345.678") == 12345678
    assert parse_amount("600,00") == 600
    assert parse_amount("5.8") == 5.8
    assert parse_amount("abc") is None


def test_detects_type_from_content_when_filename_says_nothing():
    assert detect_document_type("Scan_0042.pdf", "Vorsorgeausweis 2025\nAltersguthaben CHF 1") == "pension_fund"
    assert detect_document_type("Scan_0043.pdf", "Ihre Lebensversicherung\nRückkaufswert") == "life_insurance"
    assert detect_document_type("Silvia_Lohnausweis.pdf", "Lohnausweis") == "generic_pdf"


def test_pension_fund_fields_without_fake_values():
    doc = b"Vorsorgeausweis\nAltersguthaben per 1.1.2025 CHF 412'300.50\nUmwandlungssatz mit 65: 5.8 %\n"
    doc_type, fields = extract_fields("Ausweis.pdf", doc)
    by_id = {f.field_id: f for f in fields}
    assert doc_type == "pension_fund"
    assert by_id["currentOldageCapital"].value == "412300.5"
    assert by_id["conversionRate"].value == "5.8"
    # not in the document → empty, never an example value like 756.0000.0000.00 or 350000
    assert by_id["ahvNumber"].value == "" and by_id["ahvNumber"].confidence_score == 0.0
    assert by_id["entryAge"].value == ""


def test_life_insurance_is_left_to_its_own_parser():
    assert extract_fields("police.pdf", b"Kapitalsumme: 100000") == ("life_insurance", [])
