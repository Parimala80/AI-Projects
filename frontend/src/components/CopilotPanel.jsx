import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Robot, PaperPlaneRight, Sparkle, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const STARTERS = [
  "Why is the GSTIN flagged?",
  "Explain this discrepancy in the totals",
  "Suggest corrections for low-confidence fields",
  "Summarize this document in 3 lines",
];

export default function CopilotPanel({ doc, onApplySuggestion }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    const next = [...messages, { role: "user", content: msg }];
    setMessages(next);
    setBusy(true);
    try {
      const { data } = await api.post(`/documents/${doc.id}/copilot/chat`, {
        message: msg,
        history: next.slice(0, -1),
      });
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      toast.error("Co-Pilot failed");
      setMessages([...next, { role: "assistant", content: `Error: ${e.response?.data?.detail || e.message}` }]);
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 bg-[color:var(--brand-primary)] text-white px-4 py-3 rounded-sm shadow-[4px_4px_0_0_rgba(0,47,167,0.5)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_0_rgba(0,47,167,0.5)]"
        data-testid="copilot-open-btn"
      >
        <Robot size={16} weight="bold" />
        <span className="font-semibold text-sm">Co-Pilot</span>
        <Sparkle size={12} weight="fill" className="text-[color:var(--accent-yellow)]" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-3rem)] z-30 swiss-card bg-white flex flex-col shadow-[6px_6px_0_0_rgba(10,10,12,0.15)]" data-testid="copilot-panel">
      <div className="px-4 py-3 border-b border-[color:var(--border-line)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[color:var(--brand-primary)] flex items-center justify-center">
            <Robot size={16} color="#fff" weight="bold" />
          </div>
          <div>
            <div className="font-display text-sm leading-none">CO-PILOT</div>
            <div className="text-[10px] label-tag mt-0.5 normal-case">{doc.filename}</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} data-testid="copilot-close-btn" className="hover:text-[color:var(--accent-red)]">
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3" data-testid="copilot-messages">
        {messages.length === 0 && (
          <div>
            <div className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-3">
              Ask anything about <strong>{doc.filename}</strong>. I can see the document image, extracted
              fields, and validation errors.
            </div>
            <div className="space-y-1.5">
              {STARTERS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="block w-full text-left text-xs font-mono p-2.5 border border-[color:var(--border-line)] hover:bg-[color:var(--bg-surface)]"
                  data-testid={`copilot-starter-${i}`}
                >
                  → {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-[color:var(--brand-primary)] text-white font-mono"
                : "bg-[color:var(--bg-surface)] border border-[color:var(--border-line)]"
            }`} data-testid={`copilot-msg-${i}`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-[color:var(--bg-surface)] border border-[color:var(--border-line)] px-3 py-2 text-xs">
              <span className="inline-block animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-[color:var(--border-line)] p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the Co-Pilot…"
          className="input-flat flex-1 !py-2"
          disabled={busy}
          data-testid="copilot-input"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary !py-2 !px-3" data-testid="copilot-send-btn">
          <PaperPlaneRight size={14} weight="bold" />
        </button>
      </form>
    </div>
  );
}
