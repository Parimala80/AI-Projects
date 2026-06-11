import { PageHeader } from "../components/Layout";
import { API } from "../lib/api";
import { ArrowSquareOut } from "@phosphor-icons/react";

const GROUPS = [
  {
    title: "Authentication",
    items: [
      ["POST", "/api/auth/register", "Create a new user/tenant"],
      ["POST", "/api/auth/login", "Email + password sign-in"],
      ["POST", "/api/auth/logout", "Sign out (clears cookies)"],
      ["GET", "/api/auth/me", "Current user info"],
      ["POST", "/api/auth/refresh", "Refresh access token"],
    ],
  },
  {
    title: "Documents",
    items: [
      ["POST", "/api/documents/upload", "Upload single document"],
      ["POST", "/api/documents/upload-bulk", "Upload many"],
      ["GET", "/api/documents", "List & search (?q,doc_type,status)"],
      ["GET", "/api/documents/{id}", "Get document metadata"],
      ["GET", "/api/documents/{id}/file", "Get base64 file content"],
      ["PUT", "/api/documents/{id}", "Edit extracted data"],
      ["POST", "/api/documents/{id}/process", "(Re)run AI extraction"],
      ["POST", "/api/documents/{id}/approve", "Approve document"],
      ["POST", "/api/documents/{id}/reject", "Reject with notes"],
      ["GET", "/api/documents/{id}/export", "Export single doc (?format)"],
      ["GET", "/api/documents/export/all", "Export all (?format=excel|csv|json|xml)"],
    ],
  },
  {
    title: "Tenant & Users",
    items: [
      ["GET", "/api/tenants/me", "Get tenant info"],
      ["PUT", "/api/tenants/me", "Update tenant (admin)"],
      ["GET", "/api/tenants/me/ocr-settings", "Get OCR + Co-Pilot config"],
      ["PUT", "/api/tenants/me/ocr-settings", "Update OCR + Co-Pilot (admin)"],
      ["POST", "/api/tenants/me/ocr-settings/test", "Ping olmOCR endpoint (admin)"],
      ["GET", "/api/tenants/me/copilot/models", "List Co-Pilot models (e.g. OpenCode Zen catalogue)"],
      ["GET", "/api/users", "List users (admin/manager)"],
      ["POST", "/api/users", "Create user (admin)"],
      ["DELETE", "/api/users/{id}", "Delete user (admin)"],
    ],
  },
  {
    title: "Vendors, Co-Pilot & Audit",
    items: [
      ["GET", "/api/vendors", "List vendors"],
      ["POST", "/api/vendors", "Add vendor"],
      ["DELETE", "/api/vendors/{id}", "Remove vendor"],
      ["POST", "/api/documents/{id}/copilot/chat", "Chat with AI Co-Pilot"],
      ["GET", "/api/audit-logs", "Audit trail (admin/manager)"],
      ["GET", "/api/dashboard/stats", "Dashboard analytics"],
    ],
  },
];

const COLORS = { GET: "dot-green", POST: "dot-blue", PUT: "dot-yellow", DELETE: "dot-red" };

export default function ApiDocs() {
  return (
    <div data-testid="api-docs-page">
      <PageHeader
        kicker="DEVELOPER"
        title="API Reference"
        description="Every platform feature is exposed via REST APIs with cookie-based JWT auth."
        actions={
          <a href={`${API.replace("/api", "")}/docs`} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-2" data-testid="open-swagger">
            Open Swagger UI <ArrowSquareOut size={13} weight="bold" />
          </a>
        }
      />
      <div className="px-8 py-6 grid md:grid-cols-2 gap-6">
        {GROUPS.map((g) => (
          <div key={g.title} className="border border-[color:var(--border-line)]">
            <div className="px-4 py-3 border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)] label-tag">{g.title}</div>
            <ul>
              {g.items.map(([m, p, d]) => (
                <li key={p + m} className="grid grid-cols-12 px-4 py-2.5 border-b border-[color:var(--border-line)] last:border-b-0 items-center text-xs font-mono">
                  <span className="col-span-2 flex items-center gap-2">
                    <span className={`dot ${COLORS[m]}`} />
                    <span className="font-bold">{m}</span>
                  </span>
                  <span className="col-span-6 truncate">{p}</span>
                  <span className="col-span-4 text-[color:var(--text-secondary)] text-right">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
