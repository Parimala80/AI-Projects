"""
Iteration 4 tests: OpenCode Zen (7th Co-Pilot provider)
- New schema fields: opencode_base_url, opencode_api_key, opencode_model, opencode_timeout
- New endpoint: GET /api/tenants/me/copilot/models (5-min server cache)
- copilot_provider='opencode_zen' allowed; 'bogus' still 400 (regression)
- opencode_api_key in SECRET_FIELDS (masked, masked-PUT preservation)
- chat handler: fake key -> graceful "OpenCode Zen error 401" (no 5xx)
- chat handler: empty key -> "OpenCode Zen API key is not configured."
- multimodal whitelist (mimo-v2-omni / mimo-v2.5-pro / minimax-m3)
- RBAC: non-admin PUT -> 403
- Regression: gemini chat still works
"""
import os
import io
import uuid
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://smart-dc-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@docintel.io"
ADMIN_PASSWORD = "Admin@123"

VISION_CAPABLE = {"mimo-v2-omni", "mimo-v2.5-pro", "minimax-m3"}
SECRET_FIELDS = ["olmocr_api_key", "azure_api_key", "m365_client_secret",
                 "gemma_api_key", "opencode_api_key"]

DEFAULTS = {
    "default_engine": "gemini",
    "olmocr_endpoint": "",
    "olmocr_api_key": "",
    "olmocr_model": "allenai/olmOCR-2-7B-1025-FP8",
    "olmocr_timeout": 120,
    "auto_fallback_threshold": 0.5,
    "copilot_enabled": True,
    "copilot_provider": "gemini",
    "copilot_model_provider": "gemini",
    "copilot_model_name": "gemini-2.5-pro",
    "azure_endpoint": "",
    "azure_api_key": "",
    "azure_deployment": "",
    "azure_api_version": "2024-10-21",
    "m365_tenant_id": "",
    "m365_client_id": "",
    "m365_client_secret": "",
    "m365_scope": "https://graph.microsoft.com/.default",
    "gemma_endpoint": "",
    "gemma_api_key": "",
    "gemma_model": "google/gemma-3-9b-it",
    "gemma_timeout": 60,
    "opencode_base_url": "https://opencode.ai/zen/go/v1",
    "opencode_api_key": "",
    "opencode_model": "deepseek-v4-pro",
    "opencode_timeout": 60,
}


def _make_invoice_image_bytes() -> bytes:
    img = Image.new("RGB", (800, 600), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    lines = ["TAX INVOICE", "Vendor: Iter4 Co", "Invoice No: INV-ITR4-001",
             "Invoice Date: 2026-01-01", "Total: 1234.56 INR"]
    y = 30
    for ln in lines:
        d.text((30, y), ln, fill=(0, 0, 0), font=font); y += 40
    buf = io.BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def ops_session(admin_session):
    email = f"TEST_iter4ops_{uuid.uuid4().hex[:8]}@docintel.io"
    pw = "Ops@12345"
    r = admin_session.post(f"{API}/users",
        json={"email": email, "password": pw, "name": "TEST iter4 ops", "role": "operations"}, timeout=15)
    assert r.status_code == 200, r.text
    user_id = r.json()["id"]
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    yield s
    admin_session.delete(f"{API}/users/{user_id}", timeout=15)


@pytest.fixture(scope="module")
def uploaded_doc(admin_session):
    img = _make_invoice_image_bytes()
    files = {"file": ("iter4_invoice.png", img, "image/png")}
    r = admin_session.post(f"{API}/documents/upload", files=files,
                           data={"auto_process": "false"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    yield d
    admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)


@pytest.fixture(scope="module", autouse=True)
def reset_at_end(admin_session):
    yield
    admin_session.put(f"{API}/tenants/me/ocr-settings", json=DEFAULTS, timeout=15)


def _reset(admin_session):
    admin_session.put(f"{API}/tenants/me/ocr-settings", json=DEFAULTS, timeout=15)


# =================== SCHEMA DEFAULTS ===================
class TestOpencodeSchema:
    def test_get_returns_opencode_defaults(self, admin_session):
        _reset(admin_session)
        r = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["opencode_base_url"] == "https://opencode.ai/zen/go/v1"
        assert s["opencode_api_key"] == ""
        assert s["opencode_model"] == "deepseek-v4-pro"
        assert s["opencode_timeout"] == 60

    def test_put_accepts_opencode_zen_provider(self, admin_session):
        _reset(admin_session)
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"copilot_provider": "opencode_zen"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["copilot_provider"] == "opencode_zen"

    def test_put_rejects_bogus_provider(self, admin_session):
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"copilot_provider": "bogus"}, timeout=15)
        assert r.status_code == 400
        body = r.json()
        # FastAPI HTTPException returns {"detail": "..."}
        text = (body.get("detail") or "").lower()
        assert "opencode_zen" in text or "must be one of" in text


# =================== SECRET MASKING ===================
class TestOpencodeMasking:
    def test_set_opencode_key_returns_masked(self, admin_session):
        _reset(admin_session)
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"opencode_api_key": "OPENCODEREALKEY1234"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["opencode_api_key"].startswith("***")
        assert body["opencode_api_key"].endswith("1234")
        # GET also masked
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["opencode_api_key"].endswith("1234")
        assert "REAL" not in g["opencode_api_key"]

    def test_masked_put_does_not_overwrite_real_key(self, admin_session):
        _reset(admin_session)
        # set real key
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"opencode_api_key": "OPENCODEREAL5678"}, timeout=15)
        g1 = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g1["opencode_api_key"].endswith("5678")
        # send masked value back
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"opencode_api_key": "***ABCD"}, timeout=15)
        assert r.status_code == 200
        g2 = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        # real key (LAST4=5678) still preserved, NOT overwritten by ***ABCD
        assert g2["opencode_api_key"].endswith("5678"), f"got: {g2['opencode_api_key']}"


# =================== MODEL DISCOVERY ===================
class TestOpencodeModelDiscovery:
    def test_models_returns_18_plus_with_multimodal_flags(self, admin_session):
        _reset(admin_session)
        # force fresh fetch
        r = admin_session.get(f"{API}/tenants/me/copilot/models",
                              params={"provider": "opencode_zen", "refresh": "true"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["provider"] == "opencode_zen"
        assert data["cached"] is False
        assert "fetched_at" in data
        models = data["models"]
        assert isinstance(models, list)
        assert len(models) >= 18, f"expected >=18 models, got {len(models)}"
        # shape
        ids = {m["id"] for m in models}
        for m in models:
            assert set(m.keys()) >= {"id", "owned_by", "created", "multimodal"}
        # multimodal flags
        for vid in VISION_CAPABLE:
            if vid in ids:
                m = next(x for x in models if x["id"] == vid)
                assert m["multimodal"] is True, f"{vid} should be multimodal"
        # text-only model is False
        text_only = [m for m in models if m["id"] not in VISION_CAPABLE]
        if text_only:
            assert text_only[0]["multimodal"] is False

    def test_models_cached_on_second_call(self, admin_session):
        # prime cache
        r1 = admin_session.get(f"{API}/tenants/me/copilot/models",
                               params={"provider": "opencode_zen", "refresh": "true"}, timeout=20)
        assert r1.status_code == 200
        # second call (no refresh) within 5 min
        r2 = admin_session.get(f"{API}/tenants/me/copilot/models",
                               params={"provider": "opencode_zen"}, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["cached"] is True

    def test_models_refresh_forces_fresh(self, admin_session):
        r = admin_session.get(f"{API}/tenants/me/copilot/models",
                              params={"provider": "opencode_zen", "refresh": "true"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["cached"] is False

    def test_models_for_gemini_returns_empty_with_note(self, admin_session):
        r = admin_session.get(f"{API}/tenants/me/copilot/models",
                              params={"provider": "gemini"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["provider"] == "gemini"
        assert data["models"] == []
        assert "note" in data and len(data["note"]) > 0


# =================== CHAT HANDLER ===================
class TestOpencodeChat:
    def test_chat_with_empty_key_returns_config_message(self, admin_session, uploaded_doc):
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_provider": "opencode_zen",
                                "opencode_api_key": ""}, timeout=15)
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
                               json={"message": "Hello?", "copilot_provider": "opencode_zen"},
                               timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        reply = body.get("reply") or body.get("answer") or body.get("message") or ""
        assert "OpenCode Zen API key is not configured" in reply, f"got: {reply}"

    def test_chat_with_fake_key_returns_graceful_401(self, admin_session, uploaded_doc):
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_provider": "opencode_zen",
                                "opencode_api_key": "fake-bad-key-iter4-test-9999",
                                "opencode_model": "deepseek-v4-pro"}, timeout=15)
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
                               json={"message": "Summarize this invoice.",
                                     "copilot_provider": "opencode_zen"},
                               timeout=60)
        # MUST NOT crash with 5xx
        assert r.status_code == 200, f"expected 200 graceful, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        reply = body.get("reply") or body.get("answer") or body.get("message") or ""
        low = reply.lower()
        assert ("opencode zen error" in low) or ("invalid api key" in low) \
               or ("401" in reply) or ("403" in reply) or ("unauthor" in low) \
               or ("opencode zen request failed" in low), \
               f"unexpected reply: {reply[:300]}"


# =================== RBAC ===================
class TestOpencodeRBAC:
    def test_non_admin_put_returns_403(self, ops_session):
        r = ops_session.put(f"{API}/tenants/me/ocr-settings",
                            json={"copilot_provider": "opencode_zen",
                                  "opencode_api_key": "OPSCANNOTSET1234"}, timeout=15)
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"


# =================== REGRESSION ===================
class TestRegression:
    def test_gemini_chat_still_works(self, admin_session, uploaded_doc):
        """Regression: switching back to gemini still produces a real LLM reply."""
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_provider": "gemini"}, timeout=15)
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
                               json={"message": "What is the invoice number?",
                                     "copilot_provider": "gemini"},
                               timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        reply = body.get("reply") or body.get("answer") or body.get("message") or ""
        assert isinstance(reply, str) and len(reply) > 5
        # should NOT contain a co-pilot error prefix
        assert not reply.lower().startswith("co-pilot error"), f"got: {reply[:200]}"

    def test_ocr_settings_get_keeps_all_iter3_fields(self, admin_session):
        _reset(admin_session)
        s = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        # spot-check old fields still present
        for k in ["azure_endpoint", "azure_api_version", "m365_scope", "gemma_model",
                  "olmocr_model", "default_engine", "copilot_enabled"]:
            assert k in s, f"regressed missing key: {k}"

    def test_documents_list_still_works(self, admin_session):
        r = admin_session.get(f"{API}/documents", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # response can be either a list or a paginated dict {documents:[], total:int}
        if isinstance(body, dict):
            assert "documents" in body and isinstance(body["documents"], list)
        else:
            assert isinstance(body, list)

    def test_dashboard_stats_still_works(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)
