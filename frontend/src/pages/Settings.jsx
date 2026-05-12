import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { CheckCircle, XCircle, Lightning, FloppyDisk, PlugsConnected, Robot } from "@phosphor-icons/react";
import { toast } from "sonner";

const ENGINES = [
  { v: "gemini", t: "Gemini", d: "Cloud (Emergent LLM Key) — vision-language extraction with line items + structured fields." },
  { v: "olmocr", t: "olmOCR", d: "Your self-hosted OSS model. Best-in-class accuracy. Needs a GPU server." },
  { v: "auto", t: "Auto-route", d: "Try olmOCR first; fall back to Gemini if olmOCR fails or confidence is low." },
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    api.get("/tenants/me/ocr-settings").then((r) => setS(r.data));
  }, []);

  const upd = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...s };
      // don't send the masked value back
      if (String(payload.olmocr_api_key || "").startsWith("***")) delete payload.olmocr_api_key;
      const { data } = await api.put("/tenants/me/ocr-settings", payload);
      setS(data);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally { setBusy(false); }
  };

  const testConnection = async () => {
    setTestResult({ loading: true });
    try {
      const { data } = await api.post("/tenants/me/ocr-settings/test");
      setTestResult(data);
      if (data.ok) toast.success("olmOCR endpoint reachable");
      else toast.error("olmOCR test failed");
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.detail || e.message });
      toast.error("Test failed");
    }
  };

  if (!s) return <div className="p-12 label-tag">LOADING…</div>;

  return (
    <div data-testid="settings-page">
      <PageHeader
        kicker="ADMINISTRATION"
        title="Engine & Co-Pilot"
        description="Choose how documents are extracted and configure the AI Co-Pilot for reviewers."
        actions={
          <button onClick={save} disabled={busy} className="btn-primary inline-flex items-center gap-2" data-testid="settings-save-btn">
            <FloppyDisk size={13} weight="bold" /> {busy ? "Saving…" : "Save settings"}
          </button>
        }
      />

      <div className="px-8 py-6 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Engine Selection */}
          <section className="swiss-card" data-testid="engine-section">
            <div className="px-6 py-4 border-b border-[color:var(--border-line)] flex items-center justify-between">
              <div>
                <div className="label-tag">OCR ENGINE</div>
                <div className="font-display text-2xl mt-1">Default extraction engine</div>
              </div>
              <Lightning size={20} weight="bold" />
            </div>
            <div className="p-6 grid md:grid-cols-3 gap-0 -m-px border-t border-[color:var(--border-line)]">
              {ENGINES.map((e) => {
                const active = s.default_engine === e.v;
                return (
                  <button
                    key={e.v}
                    onClick={() => upd("default_engine", e.v)}
                    data-testid={`engine-${e.v}`}
                    className={`text-left p-5 border border-[color:var(--border-line)] -m-px ${
                      active ? "bg-[color:var(--brand-primary)] text-white" : "bg-white hover:bg-[color:var(--bg-surface)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-lg">{e.t}</span>
                      {active && <CheckCircle size={16} weight="bold" />}
                    </div>
                    <div className={`text-xs leading-relaxed ${active ? "text-white/70" : "text-[color:var(--text-secondary)]"}`}>
                      {e.d}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* olmOCR config */}
          <section className="swiss-card" data-testid="olmocr-section">
            <div className="px-6 py-4 border-b border-[color:var(--border-line)] flex items-center justify-between">
              <div>
                <div className="label-tag">olmOCR · SELF-HOSTED</div>
                <div className="font-display text-2xl mt-1">Your GPU endpoint</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-1">
                  Point this at a vLLM-served olmOCR (OpenAI-compatible API).
                </div>
              </div>
              <PlugsConnected size={20} weight="bold" />
            </div>
            <div className="p-6 grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label-tag block mb-1.5">ENDPOINT URL</label>
                <input
                  className="input-flat"
                  value={s.olmocr_endpoint || ""}
                  onChange={(e) => upd("olmocr_endpoint", e.target.value)}
                  placeholder="http://gpu-host.example.com:8000"
                  data-testid="olmocr-endpoint-input"
                />
              </div>
              <div>
                <label className="label-tag block mb-1.5">API KEY (optional)</label>
                <input
                  type="password"
                  className="input-flat"
                  value={s.olmocr_api_key || ""}
                  onChange={(e) => upd("olmocr_api_key", e.target.value)}
                  placeholder="Bearer token, if your server requires one"
                  data-testid="olmocr-apikey-input"
                />
              </div>
              <div>
                <label className="label-tag block mb-1.5">MODEL NAME</label>
                <input
                  className="input-flat"
                  value={s.olmocr_model || ""}
                  onChange={(e) => upd("olmocr_model", e.target.value)}
                  data-testid="olmocr-model-input"
                />
              </div>
              <div>
                <label className="label-tag block mb-1.5">TIMEOUT (SECONDS)</label>
                <input
                  type="number"
                  className="input-flat"
                  value={s.olmocr_timeout || 120}
                  onChange={(e) => upd("olmocr_timeout", parseInt(e.target.value) || 120)}
                  data-testid="olmocr-timeout-input"
                />
              </div>
              <div>
                <label className="label-tag block mb-1.5">AUTO FALLBACK THRESHOLD</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="input-flat"
                  value={s.auto_fallback_threshold ?? 0.5}
                  onChange={(e) => upd("auto_fallback_threshold", parseFloat(e.target.value))}
                  data-testid="olmocr-threshold-input"
                />
                <div className="text-xs text-[color:var(--text-secondary)] mt-1">
                  In auto-mode, fall back to Gemini if olmOCR confidence is below this value.
                </div>
              </div>
              <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-[color:var(--border-line)]">
                <button onClick={testConnection} disabled={!s.olmocr_endpoint} className="btn-secondary inline-flex items-center gap-2" data-testid="olmocr-test-btn">
                  Test connection
                </button>
                {testResult && (
                  <span className={`status-pill ${testResult.ok ? "" : "!text-[color:var(--accent-red)]"}`} data-testid="olmocr-test-result">
                    <span className={`dot ${testResult.loading ? "dot-grey" : testResult.ok ? "dot-green" : "dot-red"}`} />
                    {testResult.loading ? "TESTING…" : testResult.ok ? `HTTP ${testResult.status}` : "FAILED"}
                  </span>
                )}
              </div>
              {testResult && !testResult.loading && testResult.body && (
                <pre className="md:col-span-2 swiss-card p-3 font-mono text-[11px] overflow-x-auto scrollbar-thin max-h-32">{testResult.body}</pre>
              )}
              {testResult && !testResult.ok && testResult.error && (
                <div className="md:col-span-2 text-xs font-mono text-[color:var(--accent-red)]">{testResult.error}</div>
              )}
            </div>
          </section>

          {/* Co-Pilot */}
          <section className="swiss-card" data-testid="copilot-section">
            <div className="px-6 py-4 border-b border-[color:var(--border-line)] flex items-center justify-between">
              <div>
                <div className="label-tag">CO-PILOT</div>
                <div className="font-display text-2xl mt-1">AI assistant for reviewers</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-1">
                  Lets reviewers chat about a document, explain discrepancies, suggest corrections.
                </div>
              </div>
              <Robot size={20} weight="bold" />
            </div>
            <div className="p-6 grid md:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!s.copilot_enabled}
                  onChange={(e) => upd("copilot_enabled", e.target.checked)}
                  data-testid="copilot-enabled-toggle"
                />
                <span className="text-sm font-semibold">Enable Co-Pilot</span>
              </label>
              <div>
                <label className="label-tag block mb-1.5">PROVIDER</label>
                <select className="input-flat" value={s.copilot_model_provider} onChange={(e) => upd("copilot_model_provider", e.target.value)} data-testid="copilot-provider-select">
                  <option value="gemini">gemini</option>
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                </select>
              </div>
              <div>
                <label className="label-tag block mb-1.5">MODEL</label>
                <input
                  className="input-flat"
                  value={s.copilot_model_name || ""}
                  onChange={(e) => upd("copilot_model_name", e.target.value)}
                  data-testid="copilot-model-input"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar help */}
        <aside className="lg:col-span-4">
          <div className="swiss-card p-6">
            <div className="label-tag mb-3">HOW THIS WORKS</div>
            <ol className="space-y-3 text-sm leading-relaxed font-mono text-xs">
              <li className="flex gap-3"><span className="font-display text-lg leading-none">1</span> Choose a default engine for your tenant.</li>
              <li className="flex gap-3"><span className="font-display text-lg leading-none">2</span> Operations users can override per upload.</li>
              <li className="flex gap-3"><span className="font-display text-lg leading-none">3</span> In <strong>auto</strong>, olmOCR runs first; Gemini takes over below the threshold.</li>
              <li className="flex gap-3"><span className="font-display text-lg leading-none">4</span> Co-Pilot uses Gemini by default to chat about the active document.</li>
            </ol>
          </div>

          <div className="swiss-card p-6 mt-4">
            <div className="label-tag mb-3">DEPLOY olmOCR</div>
            <div className="text-xs text-[color:var(--text-secondary)] mb-3">
              On any RTX 4090 / A100 box:
            </div>
            <pre className="bg-[color:var(--bg-surface)] border border-[color:var(--border-line)] p-3 text-[11px] font-mono overflow-x-auto scrollbar-thin">{`pip install olmocr
vllm serve allenai/olmOCR-2-7B-1025-FP8 \\
  --served-model-name olmocr \\
  --port 8000 \\
  --max-model-len 16384`}</pre>
            <div className="text-xs text-[color:var(--text-secondary)] mt-3">
              Then put <code className="font-mono">http://your-host:8000</code> in the endpoint above.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
