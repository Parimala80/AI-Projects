import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

export default function Vendors() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ name: "", gstin: "", address: "", contact: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/vendors").then((r) => setVendors(r.data));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.gstin) delete payload.gstin;
      await api.post("/vendors", payload);
      setForm({ name: "", gstin: "", address: "", contact: "" });
      toast.success("Vendor added");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete vendor?")) return;
    await api.delete(`/vendors/${id}`);
    load();
    toast.success("Deleted");
  };

  const canEdit = ["admin", "operations", "finance"].includes(user?.role);

  return (
    <div data-testid="vendors-page">
      <PageHeader
        kicker="MASTER DATA"
        title="Vendors"
        description="Maintain your vendor master for GSTIN validation and PO matching."
      />
      <div className="px-8 py-6 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <div className="border border-[color:var(--border-line)]">
            <div className="grid grid-cols-12 px-4 py-3 label-tag border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)]">
              <div className="col-span-4">VENDOR</div>
              <div className="col-span-3">GSTIN</div>
              <div className="col-span-3">CONTACT</div>
              <div className="col-span-2 text-right">ACTION</div>
            </div>
            {vendors.length === 0 && (
              <div className="p-8 text-sm text-[color:var(--text-secondary)] text-center" data-testid="vendors-empty">
                No vendors yet.
              </div>
            )}
            {vendors.map((v) => (
              <div key={v.id} className="grid grid-cols-12 px-4 py-3 border-b border-[color:var(--border-line)] last:border-b-0 items-center" data-testid={`vendor-row-${v.id}`}>
                <div className="col-span-4">
                  <div className="font-semibold text-sm">{v.name}</div>
                  <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">{v.address || "—"}</div>
                </div>
                <div className="col-span-3 font-mono text-xs">{v.gstin || "—"}</div>
                <div className="col-span-3 font-mono text-xs">{v.contact || "—"}</div>
                <div className="col-span-2 text-right">
                  {canEdit && (
                    <button onClick={() => remove(v.id)} className="text-xs label-tag hover:text-[color:var(--accent-red)] inline-flex items-center gap-1" data-testid={`delete-vendor-${v.id}`}>
                      <Trash size={12} weight="bold" /> DELETE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <form onSubmit={create} className="lg:col-span-4 swiss-card p-6 self-start" data-testid="add-vendor-form">
            <div className="label-tag mb-3">NEW VENDOR</div>
            <label className="label-tag block mb-1.5">NAME</label>
            <input className="input-flat mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="vendor-name-input" />
            <label className="label-tag block mb-1.5">GSTIN</label>
            <input className="input-flat mb-3" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" data-testid="vendor-gstin-input" />
            <label className="label-tag block mb-1.5">CONTACT</label>
            <input className="input-flat mb-3" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} data-testid="vendor-contact-input" />
            <label className="label-tag block mb-1.5">ADDRESS</label>
            <textarea className="input-flat mb-3" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="vendor-address-input" />
            <button type="submit" disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-2" data-testid="vendor-submit-btn">
              <Plus size={13} weight="bold" /> {busy ? "Saving…" : "Add vendor"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
