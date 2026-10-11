"""AI provider adapter (port of the Fintools adapter).

ai = {provider, endpoint, model, key}. Anthropic speaks its native Messages API,
every other provider (local, OpenAI, Gemini, xAI, Meta, Mistral, DeepSeek, Qwen, Kimi,
Z.AI, MiniMax, MiMo, StepFun, OpenRouter — list lives in AI_PROVIDERS in
frontend/src/components/settings/SettingsModal.tsx) the OpenAI-compatible
/chat/completions + /models.
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import socket
from urllib.parse import urlparse

import httpx

IN_DOCKER = os.path.exists("/.dockerenv")
LOCAL_AI = {"lmstudio", "ollama"}
_NON_CHAT = re.compile(r"embed|tts|whisper|dall-e|moderation|transcri|realtime|audio|image|rerank|ocr", re.I)


class AiError(Exception):
    pass


def is_active(ai: dict | None) -> bool:
    return bool(ai and ai.get("provider") not in (None, "", "disabled") and ai.get("endpoint"))


def ai_base(endpoint: str | None) -> str:
    base = (endpoint or "http://localhost:1234").rstrip("/")
    # Inside Docker, "localhost" is the container itself — LM Studio/Ollama run on the host.
    if IN_DOCKER:
        base = re.sub(r"//(localhost|127\.0\.0\.1)(?=[:/]|$)", "//host.docker.internal", base)
    # Bare host (LM Studio/Ollama) → /v1; otherwise the path is taken as-is
    # (Z.AI …/paas/v4, Gemini …/v1beta/openai, Kimi Code …/coding/v1)
    return f"{base}/v1" if re.fullmatch(r"https?://[^/]+", base) else base


def check_endpoint(endpoint: str, production: bool) -> None:
    """Reject endpoints the server must not call.

    In production anyone can register, and the backend fetches this URL — so only public
    https hosts are allowed there (no LM Studio/Ollama, no internal services).
    """
    url = urlparse(endpoint or "")
    if url.scheme not in ("http", "https") or not url.hostname:
        raise AiError("Ungültige Endpoint-URL.")
    if not production:
        return
    if url.scheme != "https":
        raise AiError("Im Produktivbetrieb sind nur https-Endpoints erlaubt.")
    try:
        infos = socket.getaddrinfo(url.hostname, url.port or 443)
    except OSError as exc:
        raise AiError(f"Host nicht auflösbar: {url.hostname}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise AiError("Lokale/interne Endpoints sind im Produktivbetrieb nicht erlaubt.")


def _headers(ai: dict) -> dict:
    if ai.get("provider") == "anthropic":
        return {"Content-Type": "application/json", "x-api-key": ai.get("key") or "", "anthropic-version": "2023-06-01"}
    headers = {"Content-Type": "application/json"}
    if ai.get("key"):
        headers["Authorization"] = f"Bearer {ai['key']}"
    return headers


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        raise AiError(f"HTTP {resp.status_code}: {resp.text[:200]}")


def list_models(ai: dict) -> list[str]:
    """Chat-capable model ids for this provider + key, sorted."""
    params = {"limit": 1000} if ai.get("provider") == "anthropic" else None
    try:
        resp = httpx.get(f"{ai_base(ai.get('endpoint'))}/models", headers=_headers(ai), params=params, timeout=15.0)
    except httpx.HTTPError as exc:
        raise AiError(str(exc) or type(exc).__name__) from exc
    _raise_for_status(resp)
    ids = [str(m.get("id") or "").removeprefix("models/") for m in resp.json().get("data") or []]  # Gemini prefixes "models/"
    return sorted(i for i in ids if i and not _NON_CHAT.search(i))


def chat(ai: dict, system: str, user: str, max_tokens: int, timeout: float) -> tuple[str, str]:
    """One-shot completion → (text, model)."""
    provider = ai.get("provider")
    base = ai_base(ai.get("endpoint"))
    url = f"{base}/chat/completions"
    if provider == "anthropic":
        url = f"{base}/messages"
        body = {"model": ai.get("model"), "max_tokens": max_tokens, "system": system,
                "messages": [{"role": "user", "content": user}]}
    elif provider in LOCAL_AI:
        # Local reasoning models (Qwen3 etc.) otherwise burn the whole token budget on thinking
        body = {"model": ai.get("model") or "default", "reasoning_effort": "none", "temperature": 0.1,
                "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": f"/no_think {system}"}, {"role": "user", "content": user}]}
    else:
        # Cloud: no temperature (OpenAI reasoning models reject non-default values);
        # OpenAI's newer models reject max_tokens in favour of max_completion_tokens
        body = {"model": ai.get("model"),
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                ("max_completion_tokens" if provider == "openai" else "max_tokens"): max_tokens}
    try:
        resp = httpx.post(url, headers=_headers(ai), json=body, timeout=timeout)
    except httpx.HTTPError as exc:
        raise AiError(str(exc) or type(exc).__name__) from exc
    _raise_for_status(resp)
    data = resp.json()
    if provider == "anthropic":
        text = "".join(b.get("text", "") for b in data.get("content") or [] if b.get("type") == "text")
    else:
        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    return text, data.get("model") or ai.get("model") or ""


def parse_json_object(raw: str) -> dict:
    """Take the outermost {...} — tolerates code fences and <think> blocks."""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        raise AiError("Modell lieferte kein JSON (evtl. max_tokens erreicht)")
    return json.loads(match.group(0))


if __name__ == "__main__":
    assert ai_base("http://localhost:1234").endswith("/v1")
    assert ai_base("https://api.z.ai/api/paas/v4") == "https://api.z.ai/api/paas/v4"
    assert parse_json_object('<think>{"x":1}</think>```json\n{"a": "1"}\n```') == {"a": "1"}
    for bad in ("ftp://x", "http://127.0.0.1:1234", "https://10.0.0.1"):
        try:
            check_endpoint(bad, production=True)
            raise SystemExit(f"accepted {bad}")
        except AiError:
            pass
    check_endpoint("http://localhost:1234", production=False)
    print("ok")
