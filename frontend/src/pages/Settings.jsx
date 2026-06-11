import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { CheckCircle, XCircle, Lightning, FloppyDisk, PlugsConnected, Robot, ArrowsClockwise, ListBullets } from "@phosphor-icons/react";
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
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[color:var(--border-line)] pb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!s.copilot_enabled}
                    onChange={(e) => upd("copilot_enabled", e.target.checked)}
                    data-testid="copilot-enabled-toggle"
                  />
                  <span className="text-sm font-semibold">Enable Co-Pilot</span>
                </label>
                <span className="label-tag">{s.copilot_provider || "gemini"}</span>
              </div>

              <div>
                <label className="label-tag block mb-1.5">PROVIDER</label>
                <select
                  className="input-flat"
                  value={s.copilot_provider || "gemini"}
                  onChange={(e) => upd("copilot_provider", e.target.value)}
                  data-testid="copilot-provider-select"
                >
                  <option value="gemini">Gemini (Emergent LLM Key)</option>
                  <option value="openai">OpenAI (Emergent LLM Key)</option>
                  <option value="anthropic">Anthropic (Emergent LLM Key)</option>
                  <option value="azure_openai">Azure OpenAI Service</option>
                  <option value="m365_copilot">Microsoft 365 Copilot</option>
                  <option value="gemma">Gemma (self-hosted)</option>
                  <option value="opencode_zen">OpenCode Zen (gateway)</option>
                </select>
              </div>

              {/* Provider-specific credential blocks */}
              {(s.copilot_provider === "gemini" || s.copilot_provider === "openai" || s.copilot_provider === "anthropic" || !s.copilot_provider) && (
                <div className="border-l-2 border-[color:var(--accent-blue)] pl-4" data-testid="copilot-emergent-config">
                  <div className="label-tag mb-2">EMERGENT LLM KEY · MODEL</div>
                  <input
                    className="input-flat"
                    value={s.copilot_model_name || ""}
                    onChange={(e) => upd("copilot_model_name", e.target.value)}
                    data-testid="copilot-model-input"
                    placeholder={s.copilot_provider === "openai" ? "gpt-5" : s.copilot_provider === "anthropic" ? "claude-sonnet-4-5-20250929" : "gemini-2.5-pro"}
                  />
                  <div className="text-xs text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                    Uses your Emergent Universal Key. No extra credentials needed.
                  </div>
                </div>
              )}

              {s.copilot_provider === "azure_openai" && (
                <div className="border-l-2 border-[color:var(--accent-blue)] pl-4 space-y-3" data-testid="copilot-azure-config">
                  <div className="label-tag mb-1">AZURE OPENAI · CREDENTIALS</div>
                  <div>
                    <label className="label-tag block mb-1.5">ENDPOINT</label>
                    <input
                      className="input-flat"
                      value={s.azure_endpoint || ""}
                      onChange={(e) => upd("azure_endpoint", e.target.value)}
                      placeholder="https://<resource>.openai.azure.com"
                      data-testid="azure-endpoint-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-tag block mb-1.5">DEPLOYMENT NAME</label>
                      <input
                        className="input-flat"
                        value={s.azure_deployment || ""}
                        onChange={(e) => upd("azure_deployment", e.target.value)}
                        placeholder="gpt-4o-prod"
                        data-testid="azure-deployment-input"
                      />
                    </div>
                    <div>
                      <label className="label-tag block mb-1.5">API VERSION</label>
                      <input
                        className="input-flat"
                        value={s.azure_api_version || "2024-10-21"}
                        onChange={(e) => upd("azure_api_version", e.target.value)}
                        data-testid="azure-api-version-input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-tag block mb-1.5">API KEY</label>
                    <input
                      type="password"
                      className="input-flat"
                      value={s.azure_api_key || ""}
                      onChange={(e) => upd("azure_api_key", e.target.value)}
                      data-testid="azure-apikey-input"
                    />
                  </div>
                  <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    Get these from Azure Portal → Azure OpenAI → Keys and Endpoint. The deployment name is what you chose when deploying the model in Azure AI Foundry.
                  </div>
                </div>
              )}

              {s.copilot_provider === "m365_copilot" && (
                <div className="border-l-2 border-[color:var(--accent-blue)] pl-4 space-y-3" data-testid="copilot-m365-config">
                  <div className="label-tag mb-1">MICROSOFT 365 COPILOT · CREDENTIALS</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-tag block mb-1.5">TENANT ID</label>
                      <input
                        className="input-flat"
                        value={s.m365_tenant_id || ""}
                        onChange={(e) => upd("m365_tenant_id", e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        data-testid="m365-tenant-input"
                      />
                    </div>
                    <div>
                      <label className="label-tag block mb-1.5">CLIENT ID</label>
                      <input
                        className="input-flat"
                        value={s.m365_client_id || ""}
                        onChange={(e) => upd("m365_client_id", e.target.value)}
                        data-testid="m365-client-input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-tag block mb-1.5">CLIENT SECRET</label>
                    <input
                      type="password"
                      className="input-flat"
                      value={s.m365_client_secret || ""}
                      onChange={(e) => upd("m365_client_secret", e.target.value)}
                      data-testid="m365-secret-input"
                    />
                  </div>
                  <div>
                    <label className="label-tag block mb-1.5">SCOPE</label>
                    <input
                      className="input-flat"
                      value={s.m365_scope || "https://graph.microsoft.com/.default"}
                      onChange={(e) => upd("m365_scope", e.target.value)}
                      data-testid="m365-scope-input"
                    />
                  </div>
                  <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    Register an app in Azure AD (Entra ID), grant <code className="font-mono">Copilot.Read</code> permission, and have an admin consent. <strong>Note:</strong> the M365 Copilot Chat API is in beta and typically expects delegated user permissions — application-only tokens may be rejected. If that happens, deploy a service account or use the embedded Copilot Studio bot via Direct Line as an alternative.
                  </div>
                </div>
              )}

              {s.copilot_provider === "gemma" && (
                <div className="border-l-2 border-[color:var(--accent-blue)] pl-4 space-y-3" data-testid="copilot-gemma-config">
                  <div className="label-tag mb-1">GEMMA · SELF-HOSTED ENDPOINT</div>
                  <div>
                    <label className="label-tag block mb-1.5">ENDPOINT</label>
                    <input
                      className="input-flat"
                      value={s.gemma_endpoint || ""}
                      onChange={(e) => upd("gemma_endpoint", e.target.value)}
                      placeholder="http://gpu-host:8001"
                      data-testid="gemma-endpoint-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-tag block mb-1.5">MODEL</label>
                      <input
                        className="input-flat"
                        value={s.gemma_model || ""}
                        onChange={(e) => upd("gemma_model", e.target.value)}
                        placeholder="google/gemma-3-9b-it"
                        data-testid="gemma-model-input"
                      />
                    </div>
                    <div>
                      <label className="label-tag block mb-1.5">TIMEOUT (s)</label>
                      <input
                        type="number"
                        className="input-flat"
                        value={s.gemma_timeout || 60}
                        onChange={(e) => upd("gemma_timeout", parseInt(e.target.value) || 60)}
                        data-testid="gemma-timeout-input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label-tag block mb-1.5">API KEY (optional)</label>
                    <input
                      type="password"
                      className="input-flat"
                      value={s.gemma_api_key || ""}
                      onChange={(e) => upd("gemma_api_key", e.target.value)}
                      data-testid="gemma-apikey-input"
                    />
                  </div>
                  <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    Run <code className="font-mono">vllm serve google/gemma-3-9b-it --port 8001</code> on your GPU box or use Ollama with its OpenAI-compatible bridge.
                  </div>
                </div>
              )}

              {s.copilot_provider === "opencode_zen" && (
                <OpenCodeBlock s={s} upd={upd} />
              )}
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

function OpenCodeBlock({ s, upd }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null); // { cached, fetched_at }

  const fetchModels = async (refresh = false) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/tenants/me/copilot/models?provider=opencode_zen${refresh ? "&refresh=true" : ""}`);
      setModels(data.models || []);
      setMeta({ cached: data.cached, fetched_at: data.fetched_at });
      toast.success(refresh ? "Catalogue refreshed" : `Loaded ${data.models.length} models`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to fetch models");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-l-2 border-[color:var(--accent-blue)] pl-4 space-y-3" data-testid="copilot-opencode-config">
      <div className="label-tag mb-1">OPENCODE ZEN · GATEWAY</div>
      <div>
        <label className="label-tag block mb-1.5">BASE URL</label>
        <input
          className="input-flat"
          value={s.opencode_base_url || ""}
          onChange={(e) => upd("opencode_base_url", e.target.value)}
          placeholder="https://opencode.ai/zen/go/v1"
          data-testid="opencode-baseurl-input"
        />
      </div>
      <div>
        <label className="label-tag block mb-1.5">API KEY</label>
        <input
          type="password"
          className="input-flat"
          value={s.opencode_api_key || ""}
          onChange={(e) => upd("opencode_api_key", e.target.value)}
          placeholder="OpenCode Zen API key"
          data-testid="opencode-apikey-input"
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="label-tag block mb-1.5">MODEL</label>
          <select
            className="input-flat"
            value={s.opencode_model || ""}
            onChange={(e) => upd("opencode_model", e.target.value)}
            data-testid="opencode-model-select"
          >
            {models.length === 0 && (
              <option value={s.opencode_model || ""}>{s.opencode_model || "— fetch catalogue first —"}</option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}{m.multimodal ? "  · multimodal" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => fetchModels(true)}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
          data-testid="opencode-fetch-models-btn"
        >
          <ArrowsClockwise size={13} weight="bold" className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Fetch models"}
        </button>
      </div>
      <div>
        <label className="label-tag block mb-1.5">TIMEOUT (s)</label>
        <input
          type="number"
          className="input-flat"
          value={s.opencode_timeout || 60}
          onChange={(e) => upd("opencode_timeout", parseInt(e.target.value) || 60)}
          data-testid="opencode-timeout-input"
        />
      </div>
      {models.length > 0 && (
        <div className="swiss-card p-3" data-testid="opencode-catalogue">
          <div className="flex items-center justify-between mb-2">
            <div className="label-tag flex items-center gap-2">
              <ListBullets size={11} weight="bold" />
              CATALOGUE · {models.length} MODELS
            </div>
            {meta && (
              <span className="text-[10px] font-mono text-[color:var(--text-secondary)]">
                {meta.cached ? "cached" : "live"} · {(meta.fetched_at || "").slice(11, 19)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono max-h-40 overflow-y-auto scrollbar-thin">
            {models.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className={`dot ${m.multimodal ? "dot-green" : "dot-grey"}`} />
                <span className={m.id === s.opencode_model ? "font-bold" : ""}>{m.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
        OpenCode Zen is an OpenAI-compatible gateway. Get your key at <code className="font-mono">opencode.ai/zen</code>. Models marked <span className="dot dot-green inline-block" /> multimodal can see the document image; text-only models will still answer using the extracted JSON as context.
      </div>
    </div>
  );
}
