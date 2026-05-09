import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { ArrowRight, Cube } from "@phosphor-icons/react";

export default function Login() {
  const [email, setEmail] = useState("admin@docintel.io");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
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
        <div className="absolute inset-0 dot-bg opacity-20" />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white flex items-center justify-center">
              <Cube size={16} color="#0A0A0C" weight="bold" />
            </div>
            <div className="font-display text-[15px]">DOCINTEL</div>
          </Link>
          <div>
            <div className="label-tag !text-white/50 mb-3">DOCUMENT INTELLIGENCE</div>
            <h1 className="font-display text-5xl tracking-tighter leading-[0.95]">
              Welcome back to<br />
              <span className="bg-[color:var(--accent-yellow)] text-black px-2">structured truth.</span>
            </h1>
            <p className="text-white/70 mt-4 max-w-md text-sm leading-relaxed">
              Sign in to review extractions, approve documents, and run analytics on your tenant.
            </p>
          </div>
          <div className="text-xs label-tag !text-white/40">© 2026 DOCINTEL · ENTERPRISE</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md fadein" data-testid="login-form">
          <div className="label-tag mb-3">SIGN IN</div>
          <h2 className="font-display text-4xl tracking-tighter mb-8">Access your workspace.</h2>

          <label className="label-tag block mb-1.5">EMAIL</label>
          <input
            type="email"
            className="input-flat mb-4"
            value={email}
            data-testid="login-email-input"
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="label-tag block mb-1.5">PASSWORD</label>
          <input
            type="password"
            className="input-flat mb-2"
            value={password}
            data-testid="login-password-input"
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div data-testid="login-error" className="text-xs font-mono text-[color:var(--accent-red)] mt-2 mb-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full mt-4 inline-flex items-center justify-center gap-2"
            data-testid="login-submit-button"
          >
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} weight="bold" />
          </button>

          <div className="text-xs label-tag mt-6 flex items-center justify-between">
            <span className="text-[color:var(--text-secondary)] normal-case tracking-normal">
              No account?
            </span>
            <Link to="/register" className="underline" data-testid="register-link">
              CREATE ONE
            </Link>
          </div>

          <div className="mt-8 swiss-card p-3 font-mono text-xs">
            <div className="label-tag mb-1">DEMO CREDENTIALS</div>
            <div>admin@docintel.io · Admin@123</div>
          </div>
        </form>
      </div>
    </div>
  );
}
