"""
Backend tests for Document Intelligence Platform.
Covers: auth, RBAC, vendors, documents (upload/list/get/file/update/process/approve/reject/export),
dashboard, audit logs, validations.
"""
import os
import io
import time
import uuid
import base64
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://smart-dc-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@docintel.io"
ADMIN_PASSWORD = "Admin@123"


def _make_invoice_image_bytes() -> bytes:
    """Create a PNG with real visible invoice-like text."""
    img = Image.new("RGB", (800, 1000), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        font2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
        font2 = ImageFont.load_default()
    lines = [
        ("TAX INVOICE", font),
        ("Vendor: Acme Industries Pvt Ltd", font2),
        ("GSTIN: 29ABCDE1234F1Z5", font2),
        ("Address: 12 MG Road, Bengaluru 560001", font2),
        ("Invoice No: INV-2025-00123", font2),
        ("Invoice Date: 2025-08-12", font2),
        ("PO Number: PO-9981", font2),
        ("", font2),
        ("Description           Qty   Rate     Amount", font2),
        ("Widget Type A           5   100.00   500.00", font2),
        ("Widget Type B           2   250.00   500.00", font2),
        ("", font2),
        ("Subtotal: 1000.00", font2),
        ("CGST 9%: 90.00", font2),
        ("SGST 9%: 90.00", font2),
        ("Total Amount: 1180.00 INR", font2),
    ]
    y = 30
    for text, f in lines:
        d.text((30, y), text, fill=(0, 0, 0), font=f)
        y += 36
    # add a simple rectangle for visual feature
    d.rectangle([20, 20, 780, 980], outline=(0, 0, 0), width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def admin_user(admin_session):
    r = admin_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def operations_user(admin_session):
    """Create a non-admin operations user for RBAC tests."""
    email = f"TEST_ops_{uuid.uuid4().hex[:8]}@docintel.io"
    pw = "Ops@12345"
    r = admin_session.post(f"{API}/users", json={
        "email": email, "password": pw, "name": "TEST Ops", "role": "operations"
    }, timeout=15)
    assert r.status_code == 200, f"create ops user failed: {r.text}"
    s = requests.Session()
    lr = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert lr.status_code == 200, f"ops login failed: {lr.text}"
    return {"session": s, "email": email, "password": pw, "user": r.json()}


# ------------ ROOT ------------
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("name") == "Document Intelligence Platform"
    assert "version" in j


# ------------ AUTH ------------
class TestAuth:
    def test_login_admin(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"
        assert "access_token" in s.cookies.get_dict()
        assert "refresh_token" in s.cookies.get_dict()

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pw"}, timeout=15)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_session(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u.get("tenant_name")
        assert "password_hash" not in u

    def test_register_creates_user(self):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@docintel.io".lower()
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Test@1234", "name": "TEST Register", "role": "operations"
        }, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == email
        assert "access_token" in s.cookies.get_dict()
        # cleanup via admin
        s_admin = requests.Session()
        s_admin.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        s_admin.delete(f"{API}/users/{u['id']}", timeout=15)

    def test_logout_clears_cookies(self, admin_session):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # subsequent /me should 401
        r2 = s.get(f"{API}/auth/me", timeout=15)
        assert r2.status_code == 401


# ------------ RBAC ------------
class TestRBAC:
    def test_non_admin_cannot_delete_user(self, operations_user, admin_user):
        s = operations_user["session"]
        r = s.delete(f"{API}/users/{admin_user['id']}", timeout=15)
        assert r.status_code == 403

    def test_non_admin_cannot_view_audit_logs(self, operations_user):
        # operations is not in admin/manager
        r = operations_user["session"].get(f"{API}/audit-logs", timeout=15)
        assert r.status_code == 403

    def test_admin_can_view_audit_logs(self, admin_session):
        r = admin_session.get(f"{API}/audit-logs", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ------------ VENDORS ------------
class TestVendors:
    def test_create_vendor_invalid_gstin(self, admin_session):
        r = admin_session.post(f"{API}/vendors", json={
            "name": "TEST_BadGST Vendor", "gstin": "INVALID_GST_123"
        }, timeout=15)
        assert r.status_code == 400

    def test_create_vendor_valid_gstin_and_list(self, admin_session, admin_user):
        name = f"TEST_Vendor_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{API}/vendors", json={
            "name": name, "gstin": "29ABCDE1234F1Z5", "address": "Bengaluru"
        }, timeout=15)
        assert r.status_code == 200
        v = r.json()
        assert v["name"] == name
        assert v["tenant_id"] == admin_user["tenant_id"]
        # list and find
        lr = admin_session.get(f"{API}/vendors", timeout=15)
        assert lr.status_code == 200
        assert any(x["id"] == v["id"] for x in lr.json())
        # cleanup
        admin_session.delete(f"{API}/vendors/{v['id']}", timeout=15)


# ------------ DOCUMENTS ------------
@pytest.fixture(scope="session")
def uploaded_doc(admin_session):
    img_bytes = _make_invoice_image_bytes()
    files = {"file": ("test_invoice.png", img_bytes, "image/png")}
    data = {"auto_process": "false"}
    r = admin_session.post(f"{API}/documents/upload", files=files, data=data, timeout=30)
    assert r.status_code == 200, f"upload failed: {r.text}"
    return r.json()


class TestDocuments:
    def test_upload_single(self, uploaded_doc):
        assert uploaded_doc["id"]
        assert uploaded_doc["filename"] == "test_invoice.png"
        assert uploaded_doc["status"] in ("pending", "processing")
        assert "file_b64" not in uploaded_doc

    def test_get_document(self, admin_session, uploaded_doc):
        r = admin_session.get(f"{API}/documents/{uploaded_doc['id']}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == uploaded_doc["id"]

    def test_get_document_file(self, admin_session, uploaded_doc):
        r = admin_session.get(f"{API}/documents/{uploaded_doc['id']}/file", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["data_url"].startswith("data:image/png;base64,")
        assert j["mime_type"] == "image/png"

    def test_list_documents_filters(self, admin_session, uploaded_doc):
        r = admin_session.get(f"{API}/documents?limit=50", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "total" in body and "documents" in body
        ids = [d["id"] for d in body["documents"]]
        assert uploaded_doc["id"] in ids
        # search by filename
        r2 = admin_session.get(f"{API}/documents", params={"q": "test_invoice"}, timeout=15)
        assert r2.status_code == 200
        assert any(d["id"] == uploaded_doc["id"] for d in r2.json()["documents"])
        # status filter
        r3 = admin_session.get(f"{API}/documents", params={"status": "all"}, timeout=15)
        assert r3.status_code == 200

    def test_upload_bulk(self, admin_session):
        img1 = _make_invoice_image_bytes()
        img2 = _make_invoice_image_bytes()
        files = [
            ("files", ("b1.png", img1, "image/png")),
            ("files", ("b2.png", img2, "image/png")),
        ]
        r = admin_session.post(f"{API}/documents/upload-bulk", files=files,
                               data={"auto_process": "false"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["uploaded"] == 2
        # cleanup
        for d in body["documents"]:
            if d.get("id"):
                admin_session.delete(f"{API}/documents/{d['id']}", timeout=15)

    def test_update_document_runs_validations(self, admin_session, uploaded_doc):
        payload = {"extracted_data": {
            "vendor_name": "Acme",
            "invoice_number": f"INV-TEST-{uuid.uuid4().hex[:6]}",
            "invoice_date": "2025-09-01",
            "total_amount": 1180,
            "vendor_gstin": "INVALID_FORMAT",
        }}
        r = admin_session.put(f"{API}/documents/{uploaded_doc['id']}", json=payload, timeout=15)
        assert r.status_code == 200
        d = r.json()
        ve = d.get("validation_errors") or []
        assert any(e["field"] == "vendor_gstin" for e in ve), f"GST warning missing in {ve}"

    def test_process_document_with_gemini(self, admin_session, uploaded_doc):
        # Real Gemini call - allow time
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/process", timeout=120)
        assert r.status_code == 200, f"process failed: {r.text}"
        d = r.json()
        # Either succeeded with extracted data or marked failed with error
        if d["status"] == "processed":
            assert d.get("confidence", 0) > 0
            ed = d.get("extracted_data") or {}
            assert ed.get("doc_type")
            # raw_text or vendor_name should be populated
            assert ed.get("raw_text") or ed.get("vendor_name")
        else:
            pytest.skip(f"Gemini processing returned status={d['status']}: {d.get('extracted_data', {}).get('error')}")

    def test_approve_document(self, admin_session, uploaded_doc):
        r = admin_session.post(f"{API}/documents/{uploaded_doc['id']}/approve", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_reject_requires_role(self, operations_user, uploaded_doc):
        r = operations_user["session"].post(f"{API}/documents/{uploaded_doc['id']}/reject",
                                             json={"notes": "bad"}, timeout=15)
        assert r.status_code == 403

    def test_export_one_excel(self, admin_session, uploaded_doc):
        r = admin_session.get(f"{API}/documents/{uploaded_doc['id']}/export",
                              params={"format": "excel"}, timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "officedocument" in ct

    def test_export_all_formats(self, admin_session):
        for fmt, expected_ct in [("excel", "spreadsheetml"), ("csv", "text/csv"),
                                  ("json", "application/json"), ("xml", "application/xml")]:
            r = admin_session.get(f"{API}/documents/export/all", params={"format": fmt}, timeout=30)
            assert r.status_code == 200, f"{fmt} export failed"
            assert expected_ct in r.headers.get("content-type", ""), f"{fmt} content-type mismatch: {r.headers.get('content-type')}"


# ------------ DASHBOARD ------------
class TestDashboard:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_documents", "by_status", "avg_confidence", "trend_14d",
                  "top_vendors", "pending_review", "failed_validations"]:
            assert k in d, f"missing key: {k}"
        assert isinstance(d["trend_14d"], list)
        assert len(d["trend_14d"]) == 14


# ------------ TENANT ISOLATION ------------
class TestTenantIsolation:
    def test_vendors_isolated_per_tenant(self):
        # Create a brand new tenant via register
        email = f"TEST_iso_{uuid.uuid4().hex[:8]}@docintel.io"
        s2 = requests.Session()
        r = s2.post(f"{API}/auth/register", json={
            "email": email, "password": "Test@1234", "name": "Iso User",
            "role": "admin", "tenant_name": f"TEST_TENANT_{uuid.uuid4().hex[:6]}"
        }, timeout=15)
        assert r.status_code == 200
        # Create vendor in this tenant
        rv = s2.post(f"{API}/vendors", json={"name": "TEST_IsoVendor", "gstin": "29ABCDE1234F1Z5"}, timeout=15)
        assert rv.status_code == 200
        v_id = rv.json()["id"]
        # admin (other tenant) should not see this vendor
        s_admin = requests.Session()
        s_admin.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        ar = s_admin.get(f"{API}/vendors", timeout=15)
        assert ar.status_code == 200
        assert all(x["id"] != v_id for x in ar.json())


# ------------ FINAL CLEANUP ------------
def test_final_cleanup_ops_user(admin_session, operations_user, uploaded_doc):
    admin_session.delete(f"{API}/documents/{uploaded_doc['id']}", timeout=15)
    admin_session.delete(f"{API}/users/{operations_user['user']['id']}", timeout=15)
