import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, API } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { StatusPill, ConfidenceBadge } from "../components/Pills";
import { MagnifyingGlass, Plus, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const TYPES = ["all", "invoice", "delivery_challan", "purchase_order", "grn", "packing_slip", "eway_bill", "transport_slip", "other", "unknown"];
const STATUSES = ["all", "pending", "processing", "processed", "approved", "rejected", "failed"];

export default function Documents() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [type, setType] = useState(params.get("type") || "all");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [data, setData] = useState({ documents: [], total: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await api.get("/documents", { params: { q: q || undefined, doc_type: type, status, limit: 100 } });
      setData(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [type, status]);

  const onSearch = (e) => {
    e.preventDefault();
    const np = new URLSearchParams();
    if (q) np.set("q", q);
    if (type !== "all") np.set("type", type);
    if (status !== "all") np.set("status", status);
    setParams(np);
    fetchData();
  };

  const exportAll = (fmt) => {
    const url = `${API}/documents/export/all?format=${fmt}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(`Exporting as ${fmt.toUpperCase()}`);
  };

  return (
    <div data-testid="documents-page">
      <PageHeader
        kicker="REPOSITORY"
        title="Documents"
        description="Search, filter and review all extracted documents in your tenant."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-[color:var(--border-line-strong)] rounded-sm overflow-hidden" data-testid="export-buttons">
              <button onClick={() => exportAll("excel")} className="px-3 py-2 text-xs font-semibold hover:bg-[color:var(--bg-surface)] flex items-center gap-1.5" data-testid="export-excel-btn">
                <DownloadSimple size={13} weight="bold" /> XLSX
              </button>
              <button onClick={() => exportAll("csv")} className="px-3 py-2 text-xs font-semibold border-l border-[color:var(--border-line)] hover:bg-[color:var(--bg-surface)]" data-testid="export-csv-btn">CSV</button>
              <button onClick={() => exportAll("json")} className="px-3 py-2 text-xs font-semibold border-l border-[color:var(--border-line)] hover:bg-[color:var(--bg-surface)]" data-testid="export-json-btn">JSON</button>
              <button onClick={() => exportAll("xml")} className="px-3 py-2 text-xs font-semibold border-l border-[color:var(--border-line)] hover:bg-[color:var(--bg-surface)]" data-testid="export-xml-btn">XML</button>
            </div>
            <Link to="/upload" className="btn-primary inline-flex items-center gap-2" data-testid="documents-upload-cta">
              <Plus size={14} weight="bold" /> Upload
            </Link>
          </div>
        }
      />

      <div className="px-8 py-6">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3 mb-6" data-testid="filter-bar">
          <div className="flex-1 min-w-[260px]">
            <label className="label-tag block mb-1.5">SEARCH</label>
            <div className="relative">
              <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Invoice no, vendor, DC no, PO no, filename"
                className="input-flat pl-9"
                data-testid="search-input"
              />
            </div>
          </div>
          <div>
            <label className="label-tag block mb-1.5">TYPE</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input-flat min-w-[180px]" data-testid="type-filter">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label-tag block mb-1.5">STATUS</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-flat min-w-[160px]" data-testid="status-filter">
              {STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary" data-testid="apply-filters">Apply</button>
        </form>

        <div className="border border-[color:var(--border-line)]">
          <div className="grid grid-cols-12 px-4 py-3 label-tag border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)]">
            <div className="col-span-3">FILENAME</div>
            <div className="col-span-2">TYPE</div>
            <div className="col-span-2">VENDOR</div>
            <div className="col-span-2">INVOICE / DC</div>
            <div className="col-span-1">CONFIDENCE</div>
            <div className="col-span-2 text-right">STATUS · DATE</div>
          </div>
          <div data-testid="documents-list">
            {loading && [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 shimmer mb-px" />
            ))}
            {!loading && data.documents.length === 0 && (
              <div className="p-12 text-center text-sm text-[color:var(--text-secondary)]" data-testid="empty-state">
                No documents found. <Link to="/upload" className="underline">Upload one</Link>.
              </div>
            )}
            {!loading && data.documents.map((d) => (
              <Link
                key={d.id}
                to={`/documents/${d.id}`}
                className="grid grid-cols-12 px-4 py-3 border-b border-[color:var(--border-line)] last:border-b-0 hover:bg-[color:var(--bg-surface)] items-center"
                data-testid={`doc-row-${d.id}`}
              >
                <div className="col-span-3 truncate text-sm font-mono">{d.filename}</div>
                <div className="col-span-2 text-xs label-tag">{d.doc_type}</div>
                <div className="col-span-2 truncate text-sm">{d.extracted_data?.vendor_name || "—"}</div>
                <div className="col-span-2 truncate text-sm font-mono">{d.extracted_data?.invoice_number || d.extracted_data?.dc_number || "—"}</div>
                <div className="col-span-1"><ConfidenceBadge value={d.confidence} /></div>
                <div className="col-span-2 flex items-center justify-end gap-3">
                  <StatusPill status={d.status} />
                  <span className="text-xs font-mono text-[color:var(--text-secondary)] hidden md:inline">
                    {(d.created_at || "").slice(0, 10)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-3 text-xs label-tag" data-testid="result-count">
          {data.documents.length} of {data.total} results
        </div>
      </div>
    </div>
  );
}
