# DocIntel — Document Intelligence Platform

## Original Problem Statement
Build an enterprise-grade AI-powered Document Intelligence Platform that digitizes physical Delivery Challans (DCs), invoices, purchase documents, transport slips, and related business documents into structured digital data and Excel outputs. Must support scanned images, mobile camera captures, PDFs, and bulk uploads. Eliminate manual data entry, reduce processing errors, improve traceability, accelerate finance/supply-chain workflows, and integrate with ERP systems.

## Tech Stack (User-confirmed Option A)
- Frontend: React 19 + React Router 7 + Tailwind + Phosphor Icons + Recharts + Sonner
- Backend: FastAPI (Python) + Motor + emergentintegrations (Gemini 2.5 Pro vision)
- Database: MongoDB
- AI: Gemini 2.5 Pro (vision) via EMERGENT_LLM_KEY for OCR + structured field extraction
- Auth: JWT (httpOnly cookies, samesite=none secure=true), bcrypt, brute-force lockout
- File storage: base64 in MongoDB (good for MVP; Object Storage upgrade is a P1 task)

## User Personas / Roles (RBAC)
- `admin` — full platform access, user/tenant management
- `operations` — upload, process, edit documents
- `finance` — approve/reject invoices, manage vendors
- `warehouse` — verify GRN/DC documents
- `manager` — view-only dashboards + audit logs

## Core Requirements (Static)
- Upload: drag-drop, mobile camera, bulk
- AI OCR + intelligent extraction (vendor, GSTIN, invoice no, DC no, PO no, dates, line items, HSN/SAC, taxes, totals, transport, signatures, barcodes)
- Side-by-side review viewer with editable fields
- Validation rules (GST regex, duplicate invoice detection, mandatory fields, total reconciliation)
- Approval workflow (approve/reject with notes)
- Search & filtering (q, doc_type, status)
- Multi-tenant isolation
- Audit logs
- Exports: Excel (multi-sheet), CSV, JSON, XML
- REST APIs with OpenAPI/Swagger (`/docs`)
- Dashboard analytics

## Implementation Status — 2026-05-09 (Phase 1 / MVP)
✅ JWT cookie auth + bcrypt + brute-force protection + admin seeding
✅ Multi-tenant model with tenant isolation on every query
✅ RBAC (5 roles) with `require_roles` dependency
✅ Public `/auth/register` is hardened — cannot self-elevate to admin (only ops/finance/warehouse/manager)
✅ Document upload (single + bulk) with auto-process pipeline
✅ Mobile camera capture
✅ Gemini 2.5 Pro extraction returning structured JSON (doc_type, fields, line items, confidence)
✅ Side-by-side viewer with zoom, edit form, line-item table
✅ Approve / reject / re-extract / save flows
✅ Excel/CSV/JSON/XML exports (single doc + bulk)
✅ Validation: GST regex, duplicate invoice detection, mandatory fields, total reconciliation
✅ Dashboard: 4 KPIs, 14-day trend, status breakdown, top vendors, doc types
✅ Vendors / Users / Audit Logs CRUD
✅ Swiss/High-Contrast UI with Cabinet Grotesk + IBM Plex
✅ API Reference page (renamed from `/api-docs` → `/developers` to avoid K8s ingress conflict)
✅ Test coverage: 26 backend pytest cases (100%) + frontend Playwright smoke

## Backlog (Prioritized)
### P0 (Phase 2)
- Real Google Vision AI integration (additional accuracy layer alongside Gemini) when API key is supplied
- PDF processing (currently only image processing in `_process_document_async`)
- Object storage migration (S3 / Emergent object storage) for files > 15MB

### P1
- Webhooks for status changes (document.processed, document.approved)
- ERP connectors: Odoo, Tally, SAP REST adapters
- Configurable Excel templates per customer
- Email ingestion (forwarder + IMAP)
- Bounding-box overlay on the source scan during review
- AI-assisted field learning (corrections feed back into extraction prompt)

### P2
- GraphQL API alongside REST
- E-way bill cross-verification (with NIC sandbox)
- Mobile-native scanner with auto-edge detection
- Advanced analytics: turnaround time, vendor scorecards, anomaly detection
- SSO (SAML / OIDC) and SCIM provisioning

## Test Credentials
See `/app/memory/test_credentials.md`. Seed admin: `admin@docintel.io / Admin@123`.

## Next Action Items
1. Provide a Google Vision AI service-account JSON to enable the secondary OCR layer.
2. Add PDF processing (PyMuPDF rasterize first page → Gemini vision).
3. Deploy a sample webhook and configurable Excel template for the first customer.
