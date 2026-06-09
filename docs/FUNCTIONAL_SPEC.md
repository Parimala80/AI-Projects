# DocIntel — Functional Specification Document

**Product**: DocIntel — Enterprise Document Intelligence Platform
**Version**: 1.0 (Iterations 1–3)
**Document type**: Functional Specification
**Last updated**: 2026-05-13
**Audience**: Product, Engineering, QA, Customer Success, Sales Engineering

---

## 1. Purpose & Scope

DocIntel is an enterprise-grade SaaS platform that digitises physical and scanned business documents — **Delivery Challans (DCs), invoices, purchase orders, goods-receipt notes (GRNs), e-way bills, packing slips, transport slips, and receipts** — into structured digital data ready for ERP ingestion, finance workflows, and supply-chain operations.

The platform combines vision-language AI (Gemini / olmOCR / Azure OpenAI / Microsoft 365 Copilot / Gemma) with rule-based business validation, role-based review workflows, and ERP-friendly exports.

### Out of Scope (current release)
- Native PDF rasterisation (image upload only — PDF planned for Phase 3)
- Email-forwarder ingestion (planned)
- Direct write-back into ERP systems (export-only today)
- GraphQL API surface (REST only)

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        DocIntel Platform                          │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Frontend   │◄──►│   Backend    │◄──►│    MongoDB        │   │
│  │  React SPA   │    │   FastAPI    │    │  (multi-tenant)   │   │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘   │
│                             │                                     │
│              ┌──────────────┼──────────────┐                     │
│              ▼              ▼              ▼                     │
│      ┌──────────────┐  ┌──────────┐  ┌──────────────┐           │
│      │ Gemini 2.5   │  │ olmOCR   │  │ Co-Pilot     │           │
│      │ (Emergent    │  │ (user-   │  │ providers    │           │
│      │  LLM Key)    │  │  hosted) │  │ (6 options)  │           │
│      └──────────────┘  └──────────┘  └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

### Tenancy
- **Multi-tenant** with strict per-request `tenant_id` isolation on every database query.
- Each tenant has its own users, documents, vendors, audit trail, OCR settings, and Co-Pilot credentials.
- A default tenant is auto-seeded on first install along with an admin account.

### Hosting model
- Backend, frontend, MongoDB run inside an Emergent Kubernetes pod.
- olmOCR and Gemma are **self-hosted** by the customer on a GPU server; DocIntel calls them via OpenAI-compatible REST.
- Azure OpenAI and Microsoft 365 Copilot are reached over public Microsoft endpoints using credentials supplied by the tenant admin.

---

## 3. User Personas & Roles

| Role | Description | Typical permissions |
|---|---|---|
| **admin** | Platform owner / IT manager | Full access — manage users, vendors, OCR engine, Co-Pilot, tenant settings, all documents, all reports. |
| **operations** | AP/ops clerk who uploads and corrects documents | Upload, edit extracted data, re-extract, manage vendors. Cannot approve/reject. |
| **finance** | Finance reviewer / approver | View, edit, approve, reject documents; manage vendors. |
| **warehouse** | Warehouse / receiving clerk | View documents (GRN/DC), edit limited fields. |
| **manager** | Business stakeholder | Read-only on documents + dashboards + audit logs. Can approve/reject. |

**RBAC enforcement** is centralised in a single FastAPI dependency `require_roles(...)`. All list/get queries are additionally scoped to the caller's `tenant_id`.

---

## 4. Feature Inventory

### 4.1 Authentication & Authorisation
- **Email + password sign-in** with bcrypt-hashed credentials.
- **JWT access + refresh tokens** delivered via HTTP-only, `samesite=none`, `secure=true` cookies.
- **Brute-force lockout**: 5 failed attempts in 15 min locks the IP+email combo.
- **Auto-seeded admin** on first start (`admin@docintel.io` / configurable via env).
- **Public registration**: hardened — cannot self-elevate to admin. Public callers are forced to a non-admin role (`operations` by default). Only existing admins can create admin accounts via `POST /api/users`.
- **Tenant provisioning**: register optionally with `tenant_name` to spin up a new isolated tenant.

### 4.2 Document Ingestion
- **Drag-and-drop upload** (single file).
- **Bulk upload** (multi-file).
- **Mobile camera capture** — live preview, snap-to-stage, repeat captures.
- **Supported file types**: PNG, JPEG, WEBP. (PDF accepted on upload but currently flagged as "image processing only".)
- **15 MB max** per file (configurable in code).
- **Engine override on upload**: admin/operations can pick `gemini`, `olmocr`, or `auto` per upload.
- **Auto-process toggle**: if on, extraction kicks off automatically in a background task.

### 4.3 AI Extraction
The system supports two distinct concerns:
1. **OCR + field extraction** — turns the source image into structured JSON.
2. **Co-Pilot chat** — lets a reviewer ask questions about the document.

#### 4.3.1 OCR Engines
Three engine choices configurable at the tenant level:

| Engine | Where it runs | Credential model |
|---|---|---|
| **gemini** (default) | Cloud — Gemini 2.5 Pro via Emergent LLM Key | None per-tenant; Emergent key is platform-wide |
| **olmocr** | Customer's GPU server (vLLM-served, OpenAI-compatible) | endpoint URL + optional bearer key + model + timeout |
| **auto** | olmOCR primary → Gemini fallback | uses olmOCR creds; falls back if olmOCR errors or confidence < `auto_fallback_threshold` (default 0.5) |

Each document records `extraction_engine` (final engine) and `extraction_attempts` (per-engine timeline with `ok`, `confidence`, `error`).

#### 4.3.2 Extracted fields (target schema)
For every supported document type the AI returns:

```
doc_type, confidence, language,
vendor_name, vendor_gstin, vendor_address,
customer_name, customer_gstin,
invoice_number, dc_number, po_number, eway_bill_number,
invoice_date, due_date,
transport_mode, vehicle_number, lr_number,
line_items: [{ description, hsn_sac, quantity, unit, unit_price, amount, tax_rate }],
subtotal, cgst, sgst, igst, total_tax, total_amount, currency,
remarks, barcode_qr_data, raw_text
```

Missing fields are returned as `null`. Confidence is a 0–1 float.

#### 4.3.3 Co-Pilot
- **Floating chat panel** on every Document Viewer page.
- Sends the **document image + extracted JSON + validation errors** as context, so it actually "sees" the document.
- **Six provider options**, all admin-configurable at the tenant level:

| Provider | Description | Required credentials |
|---|---|---|
| **gemini** | Gemini via Emergent Universal Key | none per-tenant |
| **openai** | OpenAI via Emergent Universal Key | none per-tenant |
| **anthropic** | Claude via Emergent Universal Key | none per-tenant |
| **azure_openai** | Customer's Azure OpenAI deployment | endpoint, api_key, deployment, api_version |
| **m365_copilot** | Microsoft 365 Copilot (Graph beta) | tenant_id, client_id, client_secret, scope |
| **gemma** | Customer's self-hosted Gemma | endpoint, model, optional key, timeout |

The Co-Pilot is **per-tenant disable-able** (`copilot_enabled`).

### 4.4 Review Workflow
- **Side-by-side viewer**: source image (zoomable, pan-scroll) on the left, structured field form on the right.
- **Per-field editing** with mono-spaced typography for data clarity.
- **Line-item table**: add row, remove row, edit description / HSN / qty / price / amount / tax.
- **Validation panel** shows live errors and warnings (see §5).
- **Save** persists edits and re-runs validations.
- **Approve** (admin/finance/manager): saves edits then stamps `status = approved`, `approved_by`.
- **Reject** (admin/finance/manager): prompts for notes, sets `status = rejected`.
- **Re-extract** (split button): runs the engine again. Dropdown override allows picking a specific engine for that run.
- **Engine badge** + **engine timeline panel**: shows which engines were tried, with confidence and error per attempt.

### 4.5 Search, Filter & List
- **Full-text search** across filename, invoice number, vendor name, DC number, PO number.
- **Filter by document type** (invoice, delivery_challan, GRN, etc.).
- **Filter by status** (pending, processing, processed, approved, rejected, failed).
- **Result count** + pagination via `limit`/`skip`.

### 4.6 Dashboard & Analytics
- **4 KPIs**: total documents, average OCR accuracy, pending review, failed validations.
- **14-day volume trend** line chart.
- **Status breakdown** (pending / processing / processed / approved / rejected / failed).
- **Top 5 vendors** bar chart.
- **Document-type distribution** list.
- **Pending review CTA** strip → routes to filtered Documents list.

### 4.7 Master Data — Vendors
- Add / list / delete vendor records.
- **GSTIN format validation** on create (rejects malformed GSTINs with HTTP 400).
- Stored fields: name, gstin, address, contact.
- Used for vendor master lookups during extraction validation.

### 4.8 User Management
- **Admin** can add / list / delete users in their tenant.
- **Manager** can list users (read-only).
- Roles assigned at creation: `admin`, `operations`, `finance`, `warehouse`, `manager`.
- A user cannot delete themselves.

### 4.9 Audit Logs
- Every state-changing action is logged: register, login, upload_document, process_document, update_document, approve_document, reject_document, delete_document, create_vendor, delete_vendor, create_user, delete_user, update_ocr_settings, copilot_chat.
- Records: `id`, `tenant_id`, `user_id` (resolved to user_name / user_email), `action`, `resource_type`, `resource_id`, `details` (free-form JSON), `created_at`.
- Visible to admin and manager via the Audit Logs page.

### 4.10 Settings (Admin)
A dedicated Settings page lets the admin configure:
- **OCR engine** (gemini / olmocr / auto) + olmOCR endpoint config + connectivity test
- **Auto-fallback confidence threshold**
- **Co-Pilot enable/disable**
- **Co-Pilot provider** (one of 6) with provider-specific credential block
- API keys / secrets are **masked on read** (`***LAST4`) and **never overwritten by masked input**.

### 4.11 Exports
- **Per-document export**: Excel (multi-sheet — Summary + LineItems) or JSON.
- **Bulk export of all tenant documents**: Excel / CSV / JSON / XML.
- Excel exports include a **LineItems sheet** with `document_id` foreign key for ERP imports.

### 4.12 Notifications
- In-app toast notifications via Sonner for save/approve/reject/upload/error events.

### 4.13 API Reference (Developer Page)
- Read-only catalogue of all REST endpoints grouped by domain.
- Link to live Swagger UI at `/docs` for interactive testing.

---

## 5. Business Rules & Validations

Validations run automatically every time a document is saved or processed. Each violation produces an entry of the form:
```
{ "field": "<field_name>", "level": "error" | "warning", "message": "..." }
```

| Rule | Level | Trigger |
|---|---|---|
| **Mandatory fields**: `vendor_name`, `invoice_number`, `invoice_date`, `total_amount` must be present | error | always |
| **GSTIN format** matches `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` | warning | when GSTIN present |
| **Duplicate invoice detection**: same `invoice_number` already exists in tenant (different doc_id) | error | when invoice_number present |
| **Total reconciliation**: \|`total_amount` − Σ(line_items.amount)\| > max(1.0, 1% of total) | warning | when both `total_amount` and `line_items` present |
| **GSTIN on vendor master**: vendor creation rejected if GSTIN malformed | error (HTTP 400) | on `POST /api/vendors` |

Documents with errors can still be saved and viewed but **cannot be approved** in a strict workflow if the admin enforces it (UX surfaces them prominently).

---

## 6. Document Status Lifecycle

```
   upload                       process              user action
┌─────────┐  auto_process?  ┌────────────┐  ok    ┌────────────┐  approve   ┌────────────┐
│ pending │─────────────────▶│ processing │────────▶│ processed  │───────────▶│  approved  │
└─────────┘                  └──────┬─────┘        └─────┬──────┘            └────────────┘
                                    │ error              │ reject
                                    ▼                    ▼
                              ┌────────────┐       ┌────────────┐
                              │   failed   │       │  rejected  │
                              └────────────┘       └────────────┘
                                    │                    │
                                    └──────► reprocess ──┘
```

- **pending**: uploaded, not yet sent to OCR
- **processing**: extraction in flight
- **processed**: extraction succeeded, awaiting human review
- **approved**: human approved, ready for ERP export
- **rejected**: human rejected with notes
- **failed**: extraction errored, available to retry

---

## 7. End-to-End User Workflows

### 7.1 Operations clerk — upload + extract
1. Logs in.
2. Goes to **Upload**.
3. Drops 12 scanned invoice JPGs (or snaps via mobile camera).
4. Leaves *Auto-extract* ON, leaves *Engine* on **tenant default**.
5. Clicks **Upload 12 files** — backend stores them, status → `processing`.
6. Within ~30s each doc moves to `processed` with extracted JSON + validations.
7. Clerk reviews each row in Documents list, opens any with low confidence, fixes fields, saves.

### 7.2 Finance reviewer — approve workflow
1. Goes to **Dashboard** → clicks **Review queue**.
2. Sees list filtered to status = `processed`.
3. Opens an invoice.
4. Reads side-by-side viewer, scans validation panel.
5. Asks Co-Pilot *"explain the total mismatch on this invoice"* — Co-Pilot reads image + JSON and replies.
6. Fixes a misread CGST amount, clicks **Save**.
7. Clicks **Approve** → status → `approved`, audit log entry created.
8. Exports the document as Excel for handoff to ERP team.

### 7.3 Admin — configure olmOCR + Co-Pilot
1. Goes to **Settings**.
2. Picks engine **auto**, pastes olmOCR endpoint `http://10.0.0.5:8000`, leaves model default.
3. Clicks **Test connection** → green ✓ HTTP 200 from `/v1/models`.
4. Lowers fallback threshold to 0.6.
5. Switches Co-Pilot provider to **Azure OpenAI**, pastes Azure endpoint + api key + deployment name.
6. Clicks **Save settings**.
7. New uploads now try olmOCR first, fall back to Gemini if olmOCR confidence < 0.6, and Co-Pilot chats use the tenant's Azure GPT-4o deployment.

### 7.4 Manager — read-only analytics
1. Logs in.
2. Dashboard shows KPIs, trend, top vendors.
3. Opens Audit Logs to see who approved what this week.
4. Cannot edit, upload, approve, or reach Settings.

---

## 8. API Surface (REST, all under `/api`)

### Authentication
- `POST /auth/register` — public, creates non-admin user (+ optional tenant)
- `POST /auth/login` — sets httpOnly cookies
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/refresh`

### Tenants & Settings
- `GET /tenants/me`
- `PUT /tenants/me` *(admin)*
- `GET /tenants/me/ocr-settings`
- `PUT /tenants/me/ocr-settings` *(admin)*
- `POST /tenants/me/ocr-settings/test` *(admin)* — pings olmOCR `/v1/models`

### Users *(admin / manager for list)*
- `GET /users`, `POST /users`, `DELETE /users/{id}`

### Vendors
- `GET /vendors`, `POST /vendors`, `DELETE /vendors/{id}`

### Documents
- `POST /documents/upload` *(multipart)*
- `POST /documents/upload-bulk`
- `GET /documents` *(query: q, doc_type, status, limit, skip)*
- `GET /documents/{id}`
- `GET /documents/{id}/file` — returns base64 data URL
- `PUT /documents/{id}` *(update extracted data)*
- `POST /documents/{id}/process?engine_override=...`
- `POST /documents/{id}/approve` *(admin/finance/manager)*
- `POST /documents/{id}/reject`
- `DELETE /documents/{id}` *(admin/operations)*
- `GET /documents/{id}/export?format=excel|json`
- `GET /documents/export/all?format=excel|csv|json|xml`

### Co-Pilot
- `POST /documents/{id}/copilot/chat` — body `{ message, history? }`

### Dashboard & Audit
- `GET /dashboard/stats`
- `GET /audit-logs` *(admin/manager)*

All endpoints are documented at runtime via **OpenAPI / Swagger UI** at `/docs`.

---

## 9. Data Model (MongoDB Collections)

| Collection | Key fields |
|---|---|
| `users` | id, email (unique), password_hash, name, role, tenant_id, created_at |
| `tenants` | id, name, gstin, ocr_settings { default_engine, olmocr_*, copilot_*, azure_*, m365_*, gemma_* }, created_at |
| `documents` | id, tenant_id, filename, mime_type, file_b64, size, doc_type, status, extracted_data, confidence, validation_errors, extraction_engine, extraction_attempts, uploaded_by, approved_by, notes, created_at, updated_at |
| `vendors` | id, tenant_id, name, gstin, address, contact, created_at |
| `audit_logs` | id, tenant_id, user_id, action, resource_type, resource_id, details, created_at |
| `login_attempts` | identifier ("{ip}:{email}"), count, last |
| `token_cache` | tenant_id, client_id, access_token, expires_at, updated_at (M365 OAuth caching) |

All `_id` fields are stripped from API responses; `id` is a UUID string.

---

## 10. Configuration Reference

### Environment variables (`/app/backend/.env`)
| Key | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name |
| `JWT_SECRET` | HMAC secret for JWT signing |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Auto-seeded admin credentials |
| `EMERGENT_LLM_KEY` | Universal LLM key for Gemini/OpenAI/Anthropic via Emergent |
| `FRONTEND_URL` | Allowed CORS origin for cookies |
| `CORS_ORIGINS` | Additional CORS origins (comma-separated) |

### Frontend env (`/app/frontend/.env`)
| Key | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Public backend base URL for browser API calls |

### Tenant-scoped OCR settings (stored in `tenants.ocr_settings`)
| Key | Default | Notes |
|---|---|---|
| `default_engine` | `gemini` | `gemini` / `olmocr` / `auto` |
| `olmocr_endpoint` | `""` | e.g. `http://gpu-host:8000` |
| `olmocr_api_key` | `""` | masked on read |
| `olmocr_model` | `allenai/olmOCR-2-7B-1025-FP8` | |
| `olmocr_timeout` | 120 | seconds |
| `auto_fallback_threshold` | 0.5 | confidence below which auto routes to Gemini |
| `copilot_enabled` | true | |
| `copilot_provider` | `gemini` | one of 6 |
| `copilot_model_name` | `gemini-2.5-pro` | for emergent providers |
| `azure_endpoint` / `azure_api_key` / `azure_deployment` / `azure_api_version` | `""`, masked, `""`, `2024-10-21` | Azure OpenAI |
| `m365_tenant_id` / `m365_client_id` / `m365_client_secret` / `m365_scope` | `""`, `""`, masked, `https://graph.microsoft.com/.default` | M365 Copilot |
| `gemma_endpoint` / `gemma_api_key` / `gemma_model` / `gemma_timeout` | `""`, masked, `google/gemma-3-9b-it`, 60 | Self-hosted Gemma |

---

## 11. Security & Compliance

| Concern | Implementation |
|---|---|
| **Authentication** | bcrypt-hashed passwords (12-round salt), JWT (HS256, 12h access, 7d refresh) |
| **Session transport** | HTTP-only cookies, `secure=true`, `samesite=none` for cross-origin |
| **Brute-force** | 5/15-min lockout per `ip:email` key |
| **Public registration** | Hardened — never grants admin role |
| **RBAC** | Centralised `require_roles()` dependency; every list/get filters by `tenant_id` |
| **Multi-tenant isolation** | All queries scoped to `tenant_id` from JWT; cross-tenant access returns 404 |
| **Secret masking** | `azure_api_key`, `m365_client_secret`, `gemma_api_key`, `olmocr_api_key` are stored full but returned as `***LAST4`; PUT silently ignores values that start with `***` |
| **Audit trail** | Every state change logged with user, action, resource, timestamp |
| **CORS** | Explicit origin list (no wildcard with credentials) |
| **MongoDB IDs** | All API responses use UUID `id`; raw `_id` is stripped |

### Known limitations
- File contents are stored base64-encoded in MongoDB (not in object storage). Acceptable for early production; Phase 3 will introduce S3 / Emergent object storage.
- M365 Copilot Chat API (beta) typically requires delegated user permissions; application-only tokens may be rejected by Microsoft. Surfaced as a graceful error string, not a crash.
- No automatic key rotation; admin must rotate Azure / olmOCR / Gemma secrets manually in the Settings page.

---

## 12. Integration Capabilities

| External system | Mode | Status |
|---|---|---|
| **Google Gemini** | Emergent Universal Key | ✅ Live (default OCR + Co-Pilot) |
| **OpenAI** | Emergent Universal Key | ✅ Selectable for Co-Pilot |
| **Anthropic** | Emergent Universal Key | ✅ Selectable for Co-Pilot |
| **olmOCR (AllenAI)** | Customer-hosted vLLM, OpenAI-compatible REST | ✅ Live |
| **Azure OpenAI Service** | Customer Azure tenant, REST | ✅ Live for Co-Pilot |
| **Microsoft 365 Copilot** | Customer M365 tenant, MS Graph beta | ✅ Wired, subject to MS beta caveats |
| **Gemma (Google)** | Customer-hosted vLLM/Ollama, OpenAI-compatible | ✅ Live for Co-Pilot |
| **Excel / CSV / JSON / XML export** | File download | ✅ Live |
| **Odoo / SAP / Tally / Oracle / MS Dynamics** | ERP push connectors | ❌ Roadmap (Phase 3) |
| **Email forwarder** | IMAP poller / SES inbound | ❌ Roadmap |
| **Webhooks** | Outbound on `document.processed`, `document.approved` | ❌ Roadmap |
| **GraphQL** | Alternative API surface | ❌ Roadmap |

---

## 13. Reports & Exports

### Per-document
- **Excel**: `Summary` sheet (one row, flattened fields) + `LineItems` sheet.
- **JSON**: full extracted JSON + raw extraction blob.

### Tenant-wide
- **Excel**: all documents in one sheet + all line items in a second sheet, linked by `document_id`.
- **CSV**: flat one-row-per-document.
- **JSON**: `{ "documents": [...] }`.
- **XML**: nested `<documents><document>...</document></documents>`.

All exports respect tenant isolation — only the caller's tenant rows are returned.

---

## 14. Non-Functional Requirements

| Attribute | Target |
|---|---|
| **Page load** | First contentful paint < 1.5s on a typical broadband connection |
| **OCR latency** | Gemini ~10–30s per page; olmOCR depends on customer GPU |
| **Co-Pilot reply latency** | 5–30s depending on provider |
| **Concurrent users** | Single tenant tested up to ~50; backend is async and scales horizontally |
| **Browser support** | Latest Chrome / Edge / Firefox / Safari (desktop + mobile) |
| **Accessibility** | Min 4.5:1 contrast, all interactive elements keyboard-reachable |
| **Localisation** | English UI; extraction supports multilingual scans (Gemini handles Hindi, Tamil, etc.) |

---

## 15. Test Coverage Snapshot

| Suite | Cases | Pass rate |
|---|---|---|
| Iteration 1 (`backend_test.py`) | 26 | 100% |
| Iteration 2 (`test_iteration2.py`) | 15 | 100% |
| Iteration 3 (`test_iteration3.py`) | 21 | 100% |
| **Total backend** | **62** | **100%** |
| Frontend Playwright smoke | 12 user flows | 100% |

Real LLM calls (Gemini, OpenAI, Claude) are exercised end-to-end; Azure/M365/Gemma error paths are exercised with fake endpoints to verify graceful failure.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **DC** | Delivery Challan — Indian document accompanying goods between consignor and consignee |
| **GRN** | Goods Receipt Note — recorded by the receiver acknowledging delivery |
| **GSTIN** | Goods and Services Tax Identification Number (15 chars, India) |
| **HSN/SAC** | Harmonised System / Service Accounting Code — Indian tax product/service codes |
| **E-way bill** | Indian electronic document required for movement of goods >₹50,000 |
| **Co-Pilot** | Embedded AI chat assistant on the document review page (product term, not Microsoft-specific) |
| **Engine** | The OCR + extraction backend (Gemini, olmOCR, or auto) |
| **Tenant** | Isolated workspace; every resource is scoped to a tenant |
| **Extraction attempt** | A single engine invocation log entry recorded on a document |
| **Confidence** | Engine self-reported quality 0–1; below `auto_fallback_threshold` triggers fallback in auto mode |
| **Masked secret** | Stored value displayed as `***LAST4`; PUT requests starting with `***` are ignored to prevent overwrite |

---

## 17. Change Log

| Iteration | Date | Highlights |
|---|---|---|
| **1.0** | 2026-05-09 | MVP — auth, RBAC, multi-tenant, upload/process via Gemini, viewer, validations, exports, dashboard, audit logs |
| **1.1** | 2026-05-09 | Renamed `/api-docs` route → `/developers`; hardened public register against admin self-elevation |
| **2.0** | 2026-05-12 | Added olmOCR engine + tenant-level engine selection + auto-fallback; added Gemini-based Co-Pilot chat panel |
| **3.0** | 2026-05-13 | Co-Pilot expanded to 6 providers (Gemini / OpenAI / Anthropic / Azure OpenAI / M365 Copilot / Gemma); secret-masking for 4 sensitive fields; partial-PUT correctness fix |

---

## 18. Roadmap (Indicative)

| Priority | Item |
|---|---|
| P0 | Native multi-page PDF rasterisation through engine router |
| P0 | Object storage for files (>15 MB or volumes > 10k docs) |
| P1 | Webhooks (`document.processed`, `document.approved`) |
| P1 | ERP write-back connectors (Tally / Odoo / SAP) |
| P1 | Configurable Excel templates per customer |
| P1 | Email ingestion (forwarder) |
| P2 | GraphQL alongside REST |
| P2 | E-way bill cross-verification via NIC sandbox |
| P2 | Mobile-native scanner with auto-edge detection |
| P2 | SSO (SAML / OIDC) and SCIM provisioning |
| P2 | Per-engine accuracy scorecard on Dashboard (A/B benchmark) |

---

*End of document.*
