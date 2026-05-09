import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/audit-logs").then((r) => setLogs(r.data)); }, []);
  return (
    <div data-testid="audit-page">
      <PageHeader kicker="COMPLIANCE" title="Audit Logs" description="A chronological trail of every action taken in your tenant." />
      <div className="px-8 py-6">
        <div className="border border-[color:var(--border-line)]">
          <div className="grid grid-cols-12 px-4 py-3 label-tag border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)]">
            <div className="col-span-2">TIMESTAMP</div>
            <div className="col-span-3">USER</div>
            <div className="col-span-2">ACTION</div>
            <div className="col-span-2">RESOURCE</div>
            <div className="col-span-3">DETAILS</div>
          </div>
          {logs.length === 0 && (
            <div className="p-8 text-center text-sm text-[color:var(--text-secondary)]" data-testid="audit-empty">
              No audit entries yet.
            </div>
          )}
          {logs.map((l) => (
            <div key={l.id} className="grid grid-cols-12 px-4 py-2.5 border-b border-[color:var(--border-line)] last:border-b-0 text-xs font-mono items-center" data-testid={`audit-${l.id}`}>
              <div className="col-span-2 text-[color:var(--text-secondary)]">{(l.created_at || "").replace("T", " ").slice(0, 19)}</div>
              <div className="col-span-3 truncate">
                <div className="text-sm font-semibold">{l.user_name}</div>
                <div className="text-[10px] text-[color:var(--text-secondary)]">{l.user_email}</div>
              </div>
              <div className="col-span-2"><span className="status-pill"><span className="dot dot-blue" /> {l.action}</span></div>
              <div className="col-span-2">{l.resource_type}<span className="text-[color:var(--text-secondary)]"> · {String(l.resource_id || "").slice(0, 8)}</span></div>
              <div className="col-span-3 truncate text-[color:var(--text-secondary)]">{JSON.stringify(l.details || {})}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
