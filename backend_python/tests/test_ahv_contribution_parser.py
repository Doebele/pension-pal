from io import BytesIO

from openpyxl import Workbook

from app.services.ahv_contribution_parser import (
    import_ahv_data_from_pdf,
    parse_ahv_pdf_import,
    parse_ahv_contributions_from_pdf,
    parse_ahv_contributions_from_text,
    parse_ahv_contributions_from_xlsx,
    validate_ahv_contributions,
)
from app.services.ocr import extract_fields


def _build_sample_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Jahr", "Jahreseinkommen", "Total", "Alter", "AHV Rente Anteil"])
    sheet.append([2022, 92000, 8400, 41, 1200])
    sheet.append([2023, 98000, 8800, 42, 1300])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_parse_ahv_contributions_from_xlsx_extracts_rows():
    rows = parse_ahv_contributions_from_xlsx(_build_sample_xlsx())
    assert len(rows) == 2
    assert rows[0].year == 2022
    assert rows[0].annual_income_chf == 92000
    assert rows[1].contribution_total_chf == 8800


def test_parse_ahv_contributions_from_text_extracts_rows():
    text = "2021 | 85000 | 7600 | 40 | 1100\n2022 | 92000 | 8400 | 41 | 1200"
    rows = parse_ahv_contributions_from_text(text)
    assert len(rows) == 2
    assert rows[1].year == 2022
    assert rows[1].age_end_of_year == 41


def test_validate_ahv_contributions_detects_gaps_and_negative():
    text = "2020 | 80000 | 7000 | 39 | 1000\n2023 | -500 | 7500 | 42 | 1200"
    rows = parse_ahv_contributions_from_text(text)
    issues = validate_ahv_contributions(rows)
    codes = {issue["code"] for issue in issues}
    assert "CONTRIBUTION_GAP" in codes
    assert "NEGATIVE_INCOME" in codes


def test_parse_ahv_contributions_from_text_handles_indexed_pdf_like_rows():
    text = (
        "0 1968 2.3% CHF 2'520 (Initial entry) -\n"
        "1 1994 3200 260 0.989 CHF 28\n"
        "2 1997 77'900 81 100 0.966"
    )
    rows = parse_ahv_contributions_from_text(text)
    assert len(rows) == 2
    assert rows[0].year == 1994
    assert rows[0].annual_income_chf == 3200
    assert rows[1].year == 1997
    assert rows[1].annual_income_chf == 77900


def test_parse_ahv_contributions_from_pdf_uses_extracted_text(monkeypatch):
    class _Page:
        def extract_text(self):
            return "1 1994 3200 260 0.989 CHF 28"

        def extract_table(self):
            return None

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.ahv_contribution_parser.pdfplumber.open", lambda _: _Pdf())
    rows = parse_ahv_contributions_from_pdf(b"%PDF")
    assert len(rows) == 1
    assert rows[0].year == 1994
    assert rows[0].annual_income_chf == 3200


def test_import_ahv_data_from_pdf_returns_dicts(tmp_path, monkeypatch):
    class _Page:
        def extract_text(self):
            return "1 1994 3200 260 0.989 CHF 28"

        def extract_table(self):
            return None

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.ahv_contribution_parser.pdfplumber.open", lambda _: _Pdf())
    sample_pdf = tmp_path / "sample.pdf"
    sample_pdf.write_bytes(b"%PDF-1.4")

    rows = import_ahv_data_from_pdf(str(sample_pdf))
    assert len(rows) == 1
    assert rows[0]["year"] == 1994
    assert rows[0]["source"] == "pdf"


def test_parse_ahv_pdf_import_returns_metadata(monkeypatch):
    class _Page:
        def extract_text(self):
            return (
                "Durchschnittseinkommen CHF 88'200\n"
                "Total akkumuliert CHF 320'000\n"
                "Differenz Monat CHF 24\n"
                "1 1994 3200 260 0.989 CHF 28"
            )

        def extract_table(self):
            return None

    class _Pdf:
        pages = [_Page()]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("app.services.ahv_contribution_parser.pdfplumber.open", lambda _: _Pdf())
    rows, metadata = parse_ahv_pdf_import(b"%PDF")
    assert len(rows) == 1
    assert metadata["average_income_reference_chf"] == 88200
    assert metadata["total_accumulated_reference_chf"] == 320000
    assert metadata["difference_table"]


def test_secondary_ocr_fields_are_present_with_priority():
    _, fields = extract_fields("vorsorgeausweis.pdf", b"Altersguthaben: 100000")
    secondary = [field for field in fields if field.priority == "secondary"]
    assert secondary, "Expected secondary OCR fields for review workflow"
