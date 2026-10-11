from app.services import ai as ai_service
from app.services.ocr import extract_fields

AI = {"provider": "openai", "endpoint": "https://api.openai.com/v1", "model": "m", "key": "k"}
DOC = b"Altersguthaben: 123'456\nUmwandlungssatz: 5.8"


def test_ai_values_override_regex(monkeypatch):
    monkeypatch.setattr(ai_service, "chat", lambda *a, **k: ('```json\n{"currentOldageCapital": 123456, "entryAge": 30}\n```', "m-1"))
    _, fields = extract_fields("bvg.pdf", DOC, ai=AI)
    by_id = {f.field_id: f for f in fields}
    assert by_id["currentOldageCapital"].value == "123456"
    assert by_id["currentOldageCapital"].source_pattern == "ai:m-1"
    assert by_id["entryAge"].value == "30"
    assert by_id["conversionRate"].value == "5.8"  # not returned by AI → regex value kept


def test_ai_failure_keeps_regex(monkeypatch):
    def boom(*a, **k):
        raise ai_service.AiError("HTTP 500")

    monkeypatch.setattr(ai_service, "chat", boom)
    assert extract_fields("bvg.pdf", DOC, ai=AI) == extract_fields("bvg.pdf", DOC)


def test_production_endpoint_policy():
    for bad in ("http://api.openai.com/v1", "https://127.0.0.1", "https://10.1.2.3/v1", "file:///etc/passwd"):
        try:
            ai_service.check_endpoint(bad, production=True)
        except ai_service.AiError:
            continue
        raise AssertionError(f"accepted {bad}")
    ai_service.check_endpoint("http://localhost:1234", production=False)
