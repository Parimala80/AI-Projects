import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { ArrowRight, Cube } from "@phosphor-icons/react";

const ROLES = ["operations", "finance", "warehouse", "manager"];

export default function Register() {
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "operations", tenant_name: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const change = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.tenant_name?.trim()) delete payload.tenant_name;
      await register(payload);
      nav("/dashboard");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block bg-[color:var(--brand-primary)] relative">
        <div className="absolute inset-0 swiss-grid-bg opacity-10" />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white flex items-center justify-center">
              <Cube size={16} color="#0A0A0C" weight="bold" />
            </div>
            <div className="font-display text-[15px]">DOCINTEL</div>
          </Link>
          <div>
            <div className="label-tag !text-white/50 mb-3">REGISTER</div>
            <h1 className="font-display text-5xl tracking-tighter leading-[0.95]">
              Spin up your<br />
              <span className="bg-[color:var(--accent-yellow)] text-black px-2">tenant.</span>
            </h1>
            <p className="text-white/70 mt-4 max-w-md text-sm leading-relaxed">
              Provision an isolated workspace for your organization. Invite teammates with role-based access.
            </p>
          </div>
          <div className="text-xs label-tag !text-white/40">SECURE · MULTI-TENANT · RBAC</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md fadein" data-testid="register-form">
          <div className="label-tag mb-3">CREATE ACCOUNT</div>
          <h2 className="font-display text-4xl tracking-tighter mb-8">Provision a workspace.</h2>

          <label className="label-tag block mb-1.5">NAME</label>
          <input className="input-flat mb-3" required value={form.name} onChange={change("name")} data-testid="register-name-input" />

          <label className="label-tag block mb-1.5">EMAIL</label>
          <input className="input-flat mb-3" type="email" required value={form.email} onChange={change("email")} data-testid="register-email-input" />

          <label className="label-tag block mb-1.5">PASSWORD</label>
          <input className="input-flat mb-3" type="password" required minLength={6} value={form.password} onChange={change("password")} data-testid="register-password-input" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-tag block mb-1.5">ROLE</label>
              <select className="input-flat" value={form.role} onChange={change("role")} data-testid="register-role-select">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label-tag block mb-1.5">ORG (optional)</label>
              <input className="input-flat" placeholder="New tenant name" value={form.tenant_name} onChange={change("tenant_name")} data-testid="register-tenant-input" />
            </div>
          </div>

          {error && <div data-testid="register-error" className="text-xs font-mono text-[color:var(--accent-red)] mt-3">{error}</div>}

          <button type="submit" disabled={busy} className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-2" data-testid="register-submit-button">
            {busy ? "Creating…" : "Create workspace"} <ArrowRight size={16} weight="bold" />
          </button>

          <div className="text-xs label-tag mt-6 flex items-center justify-between">
            <span className="text-[color:var(--text-secondary)] normal-case tracking-normal">Already onboarded?</span>
            <Link to="/login" className="underline" data-testid="login-link">SIGN IN</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
