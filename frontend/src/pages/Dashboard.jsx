import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { ArrowUpRight, ArrowDown, Files, ChartBar, Pulse, Warning } from "@phosphor-icons/react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        kicker="OVERVIEW"
        title="Operations Dashboard"
        description="Real-time view of document throughput, accuracy and exception queue across your tenant."
        actions={
          <Link to="/upload" className="btn-primary inline-flex items-center gap-2" data-testid="upload-cta">
            Upload Documents <ArrowUpRight size={14} weight="bold" />
          </Link>
        }
      />

      <div className="px-8 py-8">
        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-[color:var(--border-line)]">
          <Kpi
            label="TOTAL DOCUMENTS"
            value={stats?.total_documents ?? "—"}
            icon={Files}
            testid="kpi-total"
          />
          <Kpi
            label="OCR ACCURACY"
            value={stats ? `${(stats.avg_confidence * 100).toFixed(1)}%` : "—"}
            icon={Pulse}
            testid="kpi-accuracy"
          />
          <Kpi
            label="PENDING REVIEW"
            value={stats?.pending_review ?? "—"}
            icon={ChartBar}
            testid="kpi-pending"
            tone={stats && stats.pending_review > 0 ? "warn" : "ok"}
          />
          <Kpi
            label="FAILED VALIDATIONS"
            value={stats?.failed_validations ?? "—"}
            icon={Warning}
            testid="kpi-failed"
            tone={stats && stats.failed_validations > 0 ? "danger" : "ok"}
          />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-0 border-l border-r border-b border-[color:var(--border-line)]">
          <div className="lg:col-span-2 p-6 border-r border-[color:var(--border-line)]" data-testid="trend-chart">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-tag">VOLUME · LAST 14 DAYS</div>
                <div className="font-display text-2xl mt-1">Daily document ingestion</div>
              </div>
            </div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={stats?.trend_14d || []} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(10,10,12,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(10,10,12,0.2)", borderRadius: 2, fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="#0A0A0C" strokeWidth={2} dot={{ r: 2.5, fill: "#002FA7" }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="p-6" data-testid="status-breakdown">
            <div className="label-tag mb-4">STATUS BREAKDOWN</div>
            <ul className="space-y-2">
              {Object.entries(stats?.by_status || {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between font-mono text-sm py-1.5 border-b border-[color:var(--border-line)] last:border-b-0">
                  <span className="flex items-center gap-2">
                    <span className={`dot ${dotForStatus(k)}`} />
                    {k}
                  </span>
                  <span className="font-bold">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-0 border border-t-0 border-[color:var(--border-line)]">
          <div className="p-6 border-r border-[color:var(--border-line)]" data-testid="vendors-chart">
            <div className="label-tag mb-4">TOP VENDORS</div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={stats?.top_vendors || []} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(10,10,12,0.06)" vertical={false} />
                  <XAxis dataKey="vendor" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid rgba(10,10,12,0.2)", borderRadius: 2, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#002FA7" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {(!stats?.top_vendors || stats.top_vendors.length === 0) && (
              <div className="text-xs text-[color:var(--text-secondary)] -mt-2">No vendor data yet — upload your first invoice.</div>
            )}
          </div>
          <div className="p-6" data-testid="type-breakdown">
            <div className="label-tag mb-4">DOCUMENT TYPES</div>
            <ul className="space-y-2">
              {Object.entries(stats?.by_type || {}).length === 0 && (
                <li className="text-xs text-[color:var(--text-secondary)]">No documents processed yet.</li>
              )}
              {Object.entries(stats?.by_type || {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between font-mono text-sm py-1.5 border-b border-[color:var(--border-line)] last:border-b-0">
                  <span>{k}</span>
                  <span className="font-bold">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 swiss-card p-6 flex items-center justify-between" data-testid="cta-strip">
          <div>
            <div className="label-tag mb-1">NEXT ACTION</div>
            <div className="font-display text-2xl">Process your queue.</div>
            <div className="text-sm text-[color:var(--text-secondary)] mt-1">
              Review pending documents, fix low-confidence fields, approve and export to Excel.
            </div>
          </div>
          <Link to="/documents?status=processed" className="btn-primary inline-flex items-center gap-2" data-testid="review-queue-cta">
            Review queue <ArrowDown size={14} weight="bold" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const dotForStatus = (s) => ({
  pending: "dot-grey", processing: "dot-blue", processed: "dot-yellow",
  approved: "dot-green", rejected: "dot-red", failed: "dot-red",
}[s] || "dot-grey");

const Kpi = ({ label, value, icon: Icon, testid, tone }) => (
  <div className="border-r border-b border-[color:var(--border-line)] last:border-r-0 p-6" data-testid={testid}>
    <div className="flex items-start justify-between">
      <div className="label-tag">{label}</div>
      <Icon size={16} weight="bold" />
    </div>
    <div className={`font-display text-4xl mt-3 tracking-tighter ${
      tone === "danger" ? "text-[color:var(--accent-red)]" :
      tone === "warn" ? "text-[color:var(--accent-blue)]" : ""
    }`}>{value}</div>
  </div>
);
