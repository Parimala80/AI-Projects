export function StatusPill({ status }) {
  const map = {
    pending: "dot-grey",
    processing: "dot-blue",
    processed: "dot-yellow",
    approved: "dot-green",
    rejected: "dot-red",
    failed: "dot-red",
  };
  return (
    <span className="status-pill" data-testid={`status-${status}`}>
      <span className={`dot ${map[status] || "dot-grey"}`} />
      {status || "unknown"}
    </span>
  );
}

export function ConfidenceBadge({ value }) {
  const v = Number(value || 0);
  const cls = v >= 0.8 ? "dot-green" : v >= 0.5 ? "dot-yellow" : "dot-red";
  return (
    <span className="status-pill" data-testid="confidence-badge">
      <span className={`dot ${cls}`} />
      {(v * 100).toFixed(0)}%
    </span>
  );
}
