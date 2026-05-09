import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, API } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { StatusPill, ConfidenceBadge } from "../components/Pills";
import { ArrowLeft, ArrowsClockwise, CheckCircle, XCircle, FloppyDisk, DownloadSimple, MagnifyingGlassPlus, MagnifyingGlassMinus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

const DOC_TYPES = ["invoice", "delivery_challan", "purchase_order", "grn", "packing_slip", "eway_bill", "transport_slip", "receipt", "other", "unknown"];

const FIELDS = [
  ["vendor_name", "Vendor name"],
  ["vendor_gstin", "Vendor GSTIN"],
  ["vendor_address", "Vendor address"],
  ["customer_name", "Customer name"],
  ["customer_gstin", "Customer GSTIN"],
  ["invoice_number", "Invoice no."],
  ["dc_number", "DC no."],
  ["po_number", "PO no."],
  ["eway_bill_number", "E-way bill no."],
  ["invoice_date", "Invoice date"],
  ["due_date", "Due date"],
  ["transport_mode", "Transport"],
  ["vehicle_number", "Vehicle no."],
  ["lr_number", "LR no."],
  ["subtotal", "Subtotal"],
  ["cgst", "CGST"],
  ["sgst", "SGST"],
  ["igst", "IGST"],
  ["total_tax", "Total tax"],
  ["total_amount", "Total amount"],
  ["currency", "Currency"],
  ["remarks", "Remarks"],
  ["barcode_qr_data", "Barcode/QR"],
];

export default function DocumentViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [file, setFile] = useState(null);
  const [data, setData] = useState({});
  const [items, setItems] = useState([]);
  const [docType, setDocType] = useState("unknown");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);

  const load = async () => {
    const [d, f] = await Promise.all([
      api.get(`/documents/${id}`),
      api.get(`/documents/${id}/file`),
    ]);
    setDoc(d.data);
    setFile(f.data);
    setData(d.data.extracted_data || {});
    setItems(d.data.extracted_data?.line_items || []);
    setDocType(d.data.doc_type || "unknown");
  };

  useEffect(() => { load().catch(() => toast.error("Failed to load document")); /* eslint-disable-next-line */ }, [id]);

  const setField = (k, v) => setData((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems((p) => [...p, { description: "", quantity: "", unit_price: "", amount: "" }]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    try {
      const merged = { ...data, line_items: items };
      const r = await api.put(`/documents/${id}`, { extracted_data: merged, doc_type: docType });
      setDoc(r.data);
      toast.success("Saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  const reprocess = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/documents/${id}/process`);
      setDoc(r.data);
      setData(r.data.extracted_data || {});
      setItems(r.data.extracted_data?.line_items || []);
      setDocType(r.data.doc_type || "unknown");
      toast.success("Re-extracted");
    } catch (e) {
      toast.error("Reprocess failed");
    } finally { setBusy(false); }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await save();
      const r = await api.post(`/documents/${id}/approve`);
      setDoc(r.data);
      toast.success("Approved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Approve failed");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    const notes = prompt("Reason for rejection?");
    if (notes === null) return;
    setBusy(true);
    try {
      const r = await api.post(`/documents/${id}/reject`, { notes });
      setDoc(r.data);
      toast.success("Rejected");
    } catch (e) {
      toast.error("Reject failed");
    } finally { setBusy(false); }
  };

  if (!doc) {
    return <div className="p-12 label-tag">LOADING DOCUMENT…</div>;
  }

  const canApprove = ["admin", "finance", "manager"].includes(user?.role);
  const canEdit = ["admin", "operations", "finance"].includes(user?.role);

  return (
    <div data-testid="viewer-page">
      <PageHeader
        kicker={`DOC · ${doc.id.slice(0, 8)}`}
        title={doc.filename}
        description={
          <span className="flex items-center gap-3 mt-1">
            <StatusPill status={doc.status} />
            <ConfidenceBadge value={doc.confidence} />
            <span className="label-tag">{doc.doc_type}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link to="/documents" className="btn-secondary inline-flex items-center gap-2" data-testid="back-button">
              <ArrowLeft size={13} weight="bold" /> Back
            </Link>
            <button onClick={reprocess} disabled={busy} className="btn-secondary inline-flex items-center gap-2" data-testid="reprocess-button">
              <ArrowsClockwise size={13} weight="bold" /> Re-extract
            </button>
            <a href={`${API}/documents/${id}/export?format=excel`} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2" data-testid="export-doc-btn">
              <DownloadSimple size={13} weight="bold" /> Excel
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 border-t border-[color:var(--border-line)]" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Left pane: document */}
        <div className="lg:col-span-6 border-r border-[color:var(--border-line)] bg-[color:var(--bg-surface)] relative" data-testid="document-pane">
          <div className="sticky top-0 z-10 px-4 py-2 bg-white border-b border-[color:var(--border-line)] flex items-center justify-between">
            <div className="label-tag">SOURCE SCAN</div>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="btn-secondary !py-1 !px-2" data-testid="zoom-out-btn"><MagnifyingGlassMinus size={12} /></button>
              <span className="font-mono text-xs px-2">{(zoom * 100).toFixed(0)}%</span>
              <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="btn-secondary !py-1 !px-2" data-testid="zoom-in-btn"><MagnifyingGlassPlus size={12} /></button>
            </div>
          </div>
          <div className="p-6 overflow-auto scrollbar-thin" style={{ maxHeight: "calc(100vh - 230px)" }}>
            {file?.mime_type?.startsWith("image/") ? (
              <img
                src={file.data_url}
                alt={doc.filename}
                style={{ transform: `scale(${zoom})`, transformOrigin: "top left", display: "block" }}
                className="max-w-full"
                data-testid="document-image"
              />
            ) : (
              <iframe title={doc.filename} src={file?.data_url} className="w-full h-[80vh] border border-[color:var(--border-line)]" data-testid="document-iframe" />
            )}
          </div>
        </div>

        {/* Right pane: data */}
        <div className="lg:col-span-6" data-testid="data-pane">
          <div className="px-6 py-4 border-b border-[color:var(--border-line)] flex items-center justify-between">
            <div>
              <div className="label-tag">EXTRACTED DATA</div>
              <div className="font-display text-xl mt-1">Review & correct fields</div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button onClick={save} disabled={busy} className="btn-secondary inline-flex items-center gap-2" data-testid="save-button">
                  <FloppyDisk size={13} weight="bold" /> Save
                </button>
              )}
              {canApprove && doc.status !== "approved" && (
                <button onClick={approve} disabled={busy} className="btn-primary inline-flex items-center gap-2" data-testid="approve-button">
                  <CheckCircle size={13} weight="bold" /> Approve
                </button>
              )}
              {canApprove && doc.status !== "rejected" && (
                <button onClick={reject} disabled={busy} className="btn-secondary inline-flex items-center gap-2 !text-[color:var(--accent-red)] !border-[color:var(--accent-red)]" data-testid="reject-button">
                  <XCircle size={13} weight="bold" /> Reject
                </button>
              )}
            </div>
          </div>

          {/* Validation panel */}
          {doc.validation_errors?.length > 0 && (
            <div className="px-6 py-4 border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)]" data-testid="validation-panel">
              <div className="label-tag mb-2">VALIDATIONS · {doc.validation_errors.length}</div>
              <ul className="space-y-1.5">
                {doc.validation_errors.map((e, i) => (
                  <li key={i} className="text-xs font-mono flex items-center gap-2">
                    <span className={`dot ${e.level === "error" ? "dot-red" : "dot-yellow"}`} />
                    <strong>{e.field}:</strong> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-6 py-5 overflow-y-auto scrollbar-thin" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="label-tag block mb-1.5">DOCUMENT TYPE</label>
                <select className="input-flat" value={docType} onChange={(e) => setDocType(e.target.value)} data-testid="doc-type-select" disabled={!canEdit}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-tag block mb-1.5">CONFIDENCE</label>
                <div className="input-flat flex items-center justify-between"><span>{((doc.confidence || 0) * 100).toFixed(1)}%</span><ConfidenceBadge value={doc.confidence} /></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {FIELDS.map(([k, label]) => (
                <div key={k} className={k === "remarks" || k === "vendor_address" ? "col-span-2" : ""}>
                  <label className="label-tag block mb-1.5">{label}</label>
                  <input
                    className="input-flat"
                    value={data[k] ?? ""}
                    onChange={(e) => setField(k, e.target.value)}
                    data-testid={`field-${k}`}
                    disabled={!canEdit}
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-[color:var(--border-line)] pt-5">
              <div className="flex items-center justify-between mb-3">
                <div className="label-tag">LINE ITEMS · {items.length}</div>
                {canEdit && <button onClick={addItem} className="text-xs underline" data-testid="add-line-item">+ ADD ROW</button>}
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[color:var(--border-line-strong)]">
                      <th className="text-left py-1.5 pr-2">DESCRIPTION</th>
                      <th className="text-left py-1.5 px-2">HSN</th>
                      <th className="text-right py-1.5 px-2">QTY</th>
                      <th className="text-right py-1.5 px-2">PRICE</th>
                      <th className="text-right py-1.5 px-2">AMOUNT</th>
                      <th className="text-right py-1.5 pl-2">TAX</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={7} className="py-3 text-center text-[color:var(--text-secondary)]">No line items extracted.</td></tr>
                    )}
                    {items.map((it, i) => (
                      <tr key={i} className="border-b border-[color:var(--border-line)]">
                        <td className="py-1 pr-2"><input value={it.description || ""} onChange={(e) => setItem(i, "description", e.target.value)} className="w-full bg-transparent py-1" data-testid={`item-${i}-desc`} disabled={!canEdit} /></td>
                        <td className="py-1 px-2"><input value={it.hsn_sac || ""} onChange={(e) => setItem(i, "hsn_sac", e.target.value)} className="w-20 bg-transparent py-1" data-testid={`item-${i}-hsn`} disabled={!canEdit} /></td>
                        <td className="py-1 px-2 text-right"><input value={it.quantity || ""} onChange={(e) => setItem(i, "quantity", e.target.value)} className="w-16 bg-transparent py-1 text-right" disabled={!canEdit} /></td>
                        <td className="py-1 px-2 text-right"><input value={it.unit_price || ""} onChange={(e) => setItem(i, "unit_price", e.target.value)} className="w-20 bg-transparent py-1 text-right" disabled={!canEdit} /></td>
                        <td className="py-1 px-2 text-right"><input value={it.amount || ""} onChange={(e) => setItem(i, "amount", e.target.value)} className="w-24 bg-transparent py-1 text-right" disabled={!canEdit} /></td>
                        <td className="py-1 pl-2 text-right"><input value={it.tax_rate || ""} onChange={(e) => setItem(i, "tax_rate", e.target.value)} className="w-16 bg-transparent py-1 text-right" disabled={!canEdit} /></td>
                        <td className="py-1 pl-2">{canEdit && <button onClick={() => removeItem(i)} className="text-[color:var(--accent-red)]" data-testid={`remove-item-${i}`}>×</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {doc.notes && (
              <div className="mt-6 swiss-card p-4">
                <div className="label-tag mb-1">NOTES</div>
                <div className="text-sm font-mono">{doc.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
