import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";

const ROLES = ["operations", "finance", "warehouse", "manager", "admin"];

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "operations" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/users", form);
      setForm({ email: "", password: "", name: "", role: "operations" });
      toast.success("User created");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete user?")) return;
    await api.delete(`/users/${id}`);
    load();
    toast.success("Deleted");
  };

  const canEdit = user?.role === "admin";

  return (
    <div data-testid="users-page">
      <PageHeader
        kicker="ACCESS"
        title="Users"
        description="Manage team members and assign roles."
      />
      <div className="px-8 py-6 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <div className="border border-[color:var(--border-line)]">
            <div className="grid grid-cols-12 px-4 py-3 label-tag border-b border-[color:var(--border-line)] bg-[color:var(--bg-surface)]">
              <div className="col-span-4">NAME</div>
              <div className="col-span-4">EMAIL</div>
              <div className="col-span-2">ROLE</div>
              <div className="col-span-2 text-right">ACTION</div>
            </div>
            {users.map((u) => (
              <div key={u.id} className="grid grid-cols-12 px-4 py-3 border-b border-[color:var(--border-line)] last:border-b-0 items-center" data-testid={`user-row-${u.id}`}>
                <div className="col-span-4 text-sm font-semibold">{u.name}</div>
                <div className="col-span-4 text-xs font-mono">{u.email}</div>
                <div className="col-span-2"><span className="status-pill"><span className="dot dot-blue" /> {u.role}</span></div>
                <div className="col-span-2 text-right">
                  {canEdit && u.id !== user.id && (
                    <button onClick={() => remove(u.id)} className="text-xs label-tag hover:text-[color:var(--accent-red)] inline-flex items-center gap-1" data-testid={`delete-user-${u.id}`}>
                      <Trash size={12} weight="bold" /> DELETE
                    </button>
                  )}
                  {u.id === user.id && <span className="label-tag">YOU</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <form onSubmit={create} className="lg:col-span-4 swiss-card p-6 self-start" data-testid="add-user-form">
            <div className="label-tag mb-3">INVITE USER</div>
            <label className="label-tag block mb-1.5">NAME</label>
            <input className="input-flat mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="new-user-name" />
            <label className="label-tag block mb-1.5">EMAIL</label>
            <input className="input-flat mb-3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="new-user-email" />
            <label className="label-tag block mb-1.5">PASSWORD</label>
            <input className="input-flat mb-3" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="new-user-password" />
            <label className="label-tag block mb-1.5">ROLE</label>
            <select className="input-flat mb-3" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="new-user-role">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="submit" disabled={busy} className="btn-primary w-full inline-flex items-center justify-center gap-2" data-testid="new-user-submit">
              <Plus size={13} weight="bold" /> {busy ? "Saving…" : "Create user"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
