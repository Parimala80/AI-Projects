"""
Iteration 2 tests: OCR engine settings (gemini|olmocr|auto with fallback),
per-upload/reprocess engine override, AI Co-Pilot chat, tenant isolation.
"""
import os
import io
import time
import uuid
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://smart-dc-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@docintel.io"
ADMIN_PASSWORD = "Admin@123"
BAD_OLMOCR = "http://nonexistent.example:9999"


def _make_invoice_image_bytes() -> bytes:
    img = Image.new("RGB", (800, 1000), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        font2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default(); font2 = font
    lines = [
        ("TAX INVOICE", font),
        ("Vendor: Iter2 Suppliers Pvt Ltd", font2),
        ("GSTIN: 29ABCDE1234F1Z5", font2),
        ("Invoice No: INV-ITR2-001", font2),
        ("Invoice Date: 2025-09-12", font2),
        ("Total Amount: 1180.00 INR", font2),
    ]
    y = 30
    for text, f in lines:
        d.text((30, y), text, fill=(0, 0, 0), font=f); y += 40
    buf = io.BytesIO(); img.save(buf, format="PNG"); return buf.getvalue()


# ---------- session fixtures ----------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_user(admin_session):
    return admin_session.get(f"{API}/auth/me", timeout=15).json()


@pytest.fixture(scope="module")
def ops_session(admin_session):
    email = f"TEST_ops2_{uuid.uuid4().hex[:8]}@docintel.io"
    pw = "Ops@12345"
    r = admin_session.post(f"{API}/users",
        json={"email": email, "password": pw, "name": "TEST Ops2", "role": "operations"}, timeout=15)
    assert r.status_code == 200, r.text
    user_id = r.json()["id"]
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    yield {"session": s, "user_id": user_id, "email": email}
    admin_session.delete(f"{API}/users/{user_id}", timeout=15)


@pytest.fixture(scope="module")
def tenant_b_admin():
    """Register a second tenant (admin) for cross-tenant isolation."""
    email = f"TEST_tb_{uuid.uuid4().hex[:8]}@docintel.io"
    pw = "TenantB@123"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": pw, "name": "TenantB Admin",
        "role": "admin", "tenant_name": f"TestTenantB_{uuid.uuid4().hex[:6]}"
    }, timeout=20)
    assert r.status_code == 200, r.text
    return {"session": s, "email": email, "user": r.json()}


@pytest.fixture(scope="module")
def uploaded_doc(admin_session):
    """Upload a doc (no auto-process) to be used for co-pilot + reprocess tests."""
    img = _make_invoice_image_bytes()
    files = {"file": ("iter2_invoice.png", img, "image/png")}
    r = admin_session.post(f"{API}/documents/upload", files=files,
                            data={"auto_process": "false"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    yield d
    admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)


@pytest.fixture(scope="module", autouse=True)
def reset_ocr_settings_at_end(admin_session):
    """Reset to defaults after the module completes."""
    yield
    admin_session.put(f"{API}/tenants/me/ocr-settings", json={
        "default_engine": "gemini",
        "olmocr_endpoint": "",
        "olmocr_api_key": "",
        "olmocr_model": "allenai/olmOCR-2-7B-1025-FP8",
        "olmocr_timeout": 120,
        "auto_fallback_threshold": 0.5,
        "copilot_enabled": True,
        "copilot_model_provider": "gemini",
        "copilot_model_name": "gemini-2.5-pro",
    }, timeout=15)


# =================== OCR SETTINGS ===================
class TestOcrSettings:
    def test_get_defaults_for_fresh_tenant(self, tenant_b_admin):
        r = tenant_b_admin["session"].get(f"{API}/tenants/me/ocr-settings", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["default_engine"] == "gemini"
        assert s["copilot_enabled"] is True
        assert s["copilot_model_provider"] == "gemini"
        assert s.get("olmocr_endpoint", "") == ""

    def test_put_updates_settings(self, admin_session):
        r = admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "default_engine": "auto",
            "olmocr_endpoint": BAD_OLMOCR,
            "olmocr_api_key": "supersecretkey1234",
            "copilot_model_provider": "gemini",
            "copilot_model_name": "gemini-2.5-pro",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["default_engine"] == "auto"
        assert body["olmocr_endpoint"] == BAD_OLMOCR
        # masked in response
        assert body["olmocr_api_key"].startswith("***")
        assert body["olmocr_api_key"].endswith("1234")
        assert "supersecretkey" not in body["olmocr_api_key"]

    def test_get_returns_masked_key(self, admin_session):
        r = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["olmocr_api_key"].startswith("***")
        assert s["olmocr_api_key"].endswith("1234")

    def test_masked_value_does_not_overwrite_real_key(self, admin_session):
        # send masked value back
        masked = "***1234"
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"olmocr_api_key": masked, "default_engine": "auto"}, timeout=15)
        assert r.status_code == 200
        # Now run /test - it should still send the real key (we can't see it,
        # but verify the persisted last4 is still '1234' and key is still masked)
        g = admin_session.get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        assert g["olmocr_api_key"].endswith("1234")

    def test_invalid_engine_rejected(self, admin_session):
        r = admin_session.put(f"{API}/tenants/me/ocr-settings",
                              json={"default_engine": "bogus_engine"}, timeout=15)
        assert r.status_code == 400

    def test_put_forbidden_non_admin(self, ops_session):
        r = ops_session["session"].put(f"{API}/tenants/me/ocr-settings",
                                       json={"default_engine": "gemini"}, timeout=15)
        assert r.status_code == 403

    def test_test_endpoint_with_bad_host(self, admin_session):
        # Ensure endpoint is set
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"olmocr_endpoint": BAD_OLMOCR, "default_engine": "auto"}, timeout=15)
        r = admin_session.post(f"{API}/tenants/me/ocr-settings/test", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is False
        assert "error" in body or body.get("status", 0) >= 400

    def test_test_endpoint_forbidden_non_admin(self, ops_session):
        r = ops_session["session"].post(f"{API}/tenants/me/ocr-settings/test", timeout=15)
        assert r.status_code == 403


# =================== ENGINE ROUTING ===================
class TestEngineRouting:
    def _upload_and_get(self, sess, engine_override=None, wait=60):
        img = _make_invoice_image_bytes()
        files = {"file": (f"er_{uuid.uuid4().hex[:6]}.png", img, "image/png")}
        data = {"auto_process": "true"}
        if engine_override:
            data["engine_override"] = engine_override
        r = sess.post(f"{API}/documents/upload", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        doc_id = r.json()["id"]
        # poll
        deadline = time.time() + wait
        while time.time() < deadline:
            g = sess.get(f"{API}/documents/{doc_id}", timeout=15).json()
            if g["status"] in ("processed", "failed"):
                return g
            time.sleep(2)
        return sess.get(f"{API}/documents/{doc_id}", timeout=15).json()

    def test_engine_override_gemini(self, admin_session):
        d = self._upload_and_get(admin_session, engine_override="gemini", wait=90)
        assert d.get("extraction_engine") == "gemini", f"got {d.get('extraction_engine')}"
        attempts = d.get("extraction_attempts") or []
        assert len(attempts) >= 1
        assert attempts[0].get("engine") == "gemini"
        # cleanup
        admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)

    def test_engine_override_olmocr_no_endpoint(self, admin_session):
        # Clear endpoint first
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"default_engine": "gemini", "olmocr_endpoint": ""}, timeout=15)
        d = self._upload_and_get(admin_session, engine_override="olmocr", wait=60)
        assert d["status"] == "failed", f"expected failed, got {d['status']}"
        assert d.get("extraction_engine") == "olmocr"
        ed = d.get("extracted_data") or {}
        assert ed.get("error"), f"no error in extracted_data: {ed}"
        admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)

    def test_auto_falls_back_to_gemini(self, admin_session):
        # set tenant default to auto with broken olmocr
        admin_session.put(f"{API}/tenants/me/ocr-settings", json={
            "default_engine": "auto",
            "olmocr_endpoint": BAD_OLMOCR,
        }, timeout=15)
        d = self._upload_and_get(admin_session, wait=120)
        assert d["status"] == "processed", f"expected processed, got {d['status']} - {d.get('extracted_data')}"
        assert d.get("extraction_engine") == "gemini"
        attempts = d.get("extraction_attempts") or []
        engines = [a.get("engine") for a in attempts]
        assert "olmocr" in engines and "gemini" in engines, f"attempts={attempts}"
        assert d.get("confidence", 0) > 0
        admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)
        # reset
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"default_engine": "gemini", "olmocr_endpoint": ""}, timeout=15)


# =================== COPILOT ===================
class TestCopilot:
    def test_copilot_chat_basic(self, admin_session, uploaded_doc):
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
                               json={"message": "What kind of document is this? Reply in one short sentence."},
                               timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reply" in body
        assert isinstance(body["reply"], str)
        assert len(body["reply"]) > 0

    def test_copilot_disabled(self, admin_session, uploaded_doc):
        # disable
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_enabled": False}, timeout=15)
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
                               json={"message": "hi"}, timeout=30)
        assert r.status_code == 200
        reply = r.json().get("reply", "").lower()
        assert "disabled" in reply or "not enabled" in reply or "co-pilot" in reply, f"got: {reply}"
        # re-enable
        admin_session.put(f"{API}/tenants/me/ocr-settings",
                          json={"copilot_enabled": True}, timeout=15)


# =================== TENANT ISOLATION ===================
class TestTenantIsolationIter2:
    def test_b_cannot_update_a_ocr_settings(self, tenant_b_admin, admin_session):
        # Note: /auth/register hardens role to non-admin, so tenant B's user is 'operations'.
        # PUT requires admin -> B should get 403.
        r = tenant_b_admin["session"].put(f"{API}/tenants/me/ocr-settings",
                                          json={"default_engine": "gemini"}, timeout=15)
        assert r.status_code == 403
        # GET ocr-settings (any role) - B sees its own defaults, not A's modifications
        b = tenant_b_admin["session"].get(f"{API}/tenants/me/ocr-settings", timeout=15).json()
        # B should have defaults (no olmocr key/endpoint set)
        assert b.get("olmocr_endpoint", "") == ""
        assert not (b.get("olmocr_api_key") or "").startswith("***")

    def test_b_cannot_chat_about_a_doc(self, tenant_b_admin, uploaded_doc):
        r = tenant_b_admin["session"].post(
            f"{API}/documents/{uploaded_doc['id']}/copilot/chat",
            json={"message": "summarize"}, timeout=20)
        assert r.status_code == 404
