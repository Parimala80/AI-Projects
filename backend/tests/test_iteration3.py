"""
Iteration 3 tests: Multi-provider Co-Pilot support
- 6 providers: gemini, openai, anthropic, azure_openai, m365_copilot, gemma
- Partial PUT via exclude_unset (no field reset)
- Secret masking for azure_api_key, m365_client_secret, gemma_api_key, olmocr_api_key
- Graceful errors for unreachable providers
- RBAC for PUT /tenants/me/ocr-settings
- Audit log entry on provider change
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

ALL_PROVIDERS = ["gemini", "openai", "anthropic", "azure_openai", "m365_copilot", "gemma"]
SECRET_FIELDS = ["olmocr_api_key", "azure_api_key", "m365_client_secret", "gemma_api_key"]

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
}


def _make_invoice_image_bytes() -> bytes:
    img = Image.new("RGB", (800, 600), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
    lines = ["TAX INVOICE", "Vendor: Iter3 Co", "Invoice No: INV-ITR3-001",
             "Invoice Date: 2025-12-01", "Total: 999.99 INR"]
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
    email = f"TEST_iter3ops_{uuid.uuid4().hex[:8]}@docintel.io"
    pw = "Ops@12345"
    r = admin_session.post(f"{API}/users",
        json={"email": email, "password": pw, "name": "TEST iter3 ops", "role": "operations"}, timeout=15)
    assert r.status_code == 200, r.text
    user_id = r.json()["id"]
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    yield s
    admin_session.delete(f"{API}/users/{user_id}", timeout=15)


@pytest.fixture(scope="module")
def uploaded_doc(admin_session):
    img = _make_invoice_image_bytes()
    files = {"file": ("iter3_invoice.png", img, "image/png")}
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


# =================== SETTINGS / SCHEMA ===================
class TestOcrSettingsNewFields:
    def test_get_returns_all_new_fields_with_defaults(self, admin_session):
        _reset(admin_session)
        r = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15)
        assert r.status_code == 200
        s = r.json()
        # check every default key is present
        for k, v in DEFAULTS.items():
            assert k in s, f"missing key {k}"
        # explicit value checks
        assert s["copilot_provider"] == "gemini"
        assert s["azure_api_version"] == "2024-10-21"
        assert s["m365_scope"] == "https://graph.microsoft.com/.default"
        assert s["gemma_model"] == "google/gemma-3-9b-it"
        assert s["gemma_timeout"] == 60

    def test_partial_put_preserves_existing_fields(self, admin_session):
        """KEY iter3 fix: model_dump(exclude_unset=True)."""
        _reset(admin_session)
        # set several fields first
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "gemma",
            "gemma_endpoint": "http://fake-gemma:8001",
            "gemma_api_key": "GEMMASECRET12345",
            "azure_endpoint": "https://fake.openai.azure.com",
            "azure_api_key": "AZUREKEY56789",
            "azure_deployment": "gpt-4o-fake",
            "m365_tenant_id": "tenant-fake-id",
            "m365_client_id": "client-fake-id",
            "m365_client_secret": "M365SECRET98765",
        }, timeout=15)
        # send a partial body that only updates gemma_model
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"gemma_model": "google/gemma-3-27b-it"}, timeout=15)
        assert r.status_code == 200
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["gemma_model"] == "google/gemma-3-27b-it"
        # preserved fields
        assert g["copilot_provider"] == "gemma"
        assert g["gemma_endpoint"] == "http://fake-gemma:8001"
        assert g["azure_endpoint"] == "https://fake.openai.azure.com"
        assert g["azure_deployment"] == "gpt-4o-fake"
        assert g["m365_tenant_id"] == "tenant-fake-id"
        assert g["m365_client_id"] == "client-fake-id"
        # masked secrets preserved (last4)
        assert g["gemma_api_key"].endswith("2345")
        assert g["azure_api_key"].endswith("6789")
        assert g["m365_client_secret"].endswith("8765")

    def test_set_credentials_all_secrets_masked(self, admin_session):
        _reset(admin_session)
        r = admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "azure_openai",
            "azure_endpoint": "https://fake.openai.azure.com",
            "azure_api_key": "AZUREREALKEYABCD",
            "azure_deployment": "gpt-4o",
            "m365_client_secret": "M365REALSECRETWXYZ",
            "gemma_api_key": "GEMMAREALKEY1111",
            "olmocr_endpoint": "http://fake-olmocr:8000",
            "olmocr_api_key": "OLMOCRREALKEY2222",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # PUT response itself returns masked
        assert body["azure_api_key"].startswith("***") and body["azure_api_key"].endswith("ABCD")
        assert body["m365_client_secret"].startswith("***") and body["m365_client_secret"].endswith("WXYZ")
        assert body["gemma_api_key"].startswith("***") and body["gemma_api_key"].endswith("1111")
        assert body["olmocr_api_key"].startswith("***") and body["olmocr_api_key"].endswith("2222")
        # GET also masked
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["azure_api_key"].endswith("ABCD")
        assert g["m365_client_secret"].endswith("WXYZ")
        assert g["gemma_api_key"].endswith("1111")
        assert g["olmocr_api_key"].endswith("2222")
        # plaintext should NOT leak
        for f in SECRET_FIELDS:
            assert "REAL" not in g[f], f"{f} leaked plaintext: {g[f]}"

    def test_masked_put_does_not_overwrite_real_key(self, admin_session):
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"azure_api_key": "FRESHREALKEY9999"}, timeout=15)
        g1 = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g1["azure_api_key"].endswith("9999")
        # send masked value back
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"azure_api_key": "***ABCD"}, timeout=15)
        assert r.status_code == 200
        g2 = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        # last4 still original
        assert g2["azure_api_key"].endswith("9999")
        # And same for m365_client_secret + gemma_api_key
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "m365_client_secret": "FRESHM365SECRT8888",
            "gemma_api_key": "FRESHGEMMA7777",
        }, timeout=15)
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "m365_client_secret": "***XXXX",
            "gemma_api_key": "***YYYY",
        }, timeout=15)
        g3 = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g3["m365_client_secret"].endswith("8888")
        assert g3["gemma_api_key"].endswith("7777")

    def test_invalid_copilot_provider_rejected(self, admin_session):
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"copilot_provider": "wrong_value"}, timeout=15)
        assert r.status_code == 400, r.text

    @pytest.mark.parametrize("provider", ALL_PROVIDERS)
    def test_all_six_providers_accepted(self, admin_session, provider):
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"copilot_provider": provider}, timeout=15)
        assert r.status_code == 200, r.text
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["copilot_provider"] == provider
        # legacy mirror
        assert g["copilot_model_provider"] == provider

    def test_non_admin_put_forbidden(self, ops_session):
        r = ops_session.put(f"{API}/tenants/me/ocr-settings",
                            json={"copilot_provider": "gemini"}, timeout=15)
        assert r.status_code == 403

    def test_audit_log_records_provider_change(self, admin_session):
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_provider": "anthropic"}, timeout=15)
        # fetch audit logs
        r = admin_session.get(f"{API}/audit-logs?limit=20", timeout=15)
        assert r.status_code == 200, r.text
        logs = r.json()
        found = False
        for entry in logs:
            if entry.get("action") == "update_ocr_settings":
                meta = entry.get("metadata") or entry.get("details") or {}
                if meta.get("copilot_provider") == "anthropic":
                    found = True
                    break
        assert found, f"no audit entry with copilot_provider=anthropic, logs[:3]={logs[:3]}"


# =================== COPILOT ROUTING ===================
class TestCopilotRouting:
    def _chat(self, sess, doc_id, msg="What is this document?"):
        return sess.post(f"{API}/documents/{doc_id}/copilot/chat",
                         json={"message": msg}, timeout=90)

    def test_gemini_real_reply(self, admin_session, uploaded_doc):
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_provider": "gemini",
                                "copilot_model_name": "gemini-2.5-pro"}, timeout=15)
        r = self._chat(admin_session, uploaded_doc["id"],
                       "Reply with one short sentence: what is this?")
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "")
        assert isinstance(reply, str) and len(reply) > 0
        # should not be an error string
        assert "error" not in reply.lower() or "invoice" in reply.lower() or "document" in reply.lower()

    def test_azure_openai_graceful_error(self, admin_session, uploaded_doc):
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "azure_openai",
            "azure_endpoint": "https://nonexistent-azure-host-xyz.openai.azure.com",
            "azure_api_key": "fake-key-12345",
            "azure_deployment": "gpt-4o",
        }, timeout=15)
        r = self._chat(admin_session, uploaded_doc["id"])
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert ("azure openai" in reply or "request failed" in reply
                or "error" in reply or "not fully configured" in reply), f"got: {reply}"

    def test_m365_copilot_graceful_error(self, admin_session, uploaded_doc):
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "m365_copilot",
            "m365_tenant_id": "00000000-0000-0000-0000-000000000000",
            "m365_client_id": "fakeclient",
            "m365_client_secret": "fakesecret",
        }, timeout=15)
        r = self._chat(admin_session, uploaded_doc["id"])
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert ("microsoft 365" in reply or "m365" in reply or "not fully configured" in reply
                or "token" in reply or "copilot" in reply or "failed" in reply), f"got: {reply}"

    def test_gemma_graceful_error(self, admin_session, uploaded_doc):
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "gemma",
            "gemma_endpoint": "http://nonexistent-gemma-host-xyz:8001",
            "gemma_model": "google/gemma-3-9b-it",
            "gemma_timeout": 10,
        }, timeout=15)
        r = self._chat(admin_session, uploaded_doc["id"])
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert ("gemma" in reply or "error" in reply or "request failed" in reply
                or "not configured" in reply), f"got: {reply}"

    def test_gemma_unconfigured_endpoint(self, admin_session, uploaded_doc):
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "copilot_provider": "gemma",
            "gemma_endpoint": "",
        }, timeout=15)
        r = self._chat(admin_session, uploaded_doc["id"])
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert "gemma" in reply and ("not configured" in reply or "endpoint" in reply), f"got: {reply}"


# =================== REGRESSION ===================
class TestRegression:
    def test_olmocr_api_key_masking_still_works(self, admin_session):
        _reset(admin_session)
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "default_engine": "auto",
            "olmocr_endpoint": "http://fake-olm:8000",
            "olmocr_api_key": "OLMOCRKEYREGRESS3333",
        }, timeout=15)
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["olmocr_api_key"].startswith("***")
        assert g["olmocr_api_key"].endswith("3333")
        assert "REGRESS" not in g["olmocr_api_key"]

    def test_documents_list_still_works(self, admin_session):
        r = admin_session.get(f"{API}/documents?limit=5", timeout=15)
        assert r.status_code == 200
        body = r.json()
        # API returns {documents: [...], total: int}
        assert isinstance(body, dict)
        assert "documents" in body and isinstance(body["documents"], list)

    def test_dashboard_stats_still_work(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)
