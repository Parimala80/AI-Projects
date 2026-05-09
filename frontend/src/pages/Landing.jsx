import { Link } from "react-router-dom";
import { ArrowRight, Cube, ShieldCheck, Pulse, Lightning, FileText, BarcodeIcon, ChartLineUp, Users } from "@phosphor-icons/react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-[color:var(--border-line)] sticky top-0 bg-white/95 backdrop-blur z-20">
        <div className="max-w-[1280px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[color:var(--brand-primary)] flex items-center justify-center">
              <Cube size={16} color="#fff" weight="bold" />
            </div>
            <div className="font-display text-[15px]">DOCINTEL</div>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-xs label-tag">
            <a href="#features">Features</a>
            <a href="#pipeline">Pipeline</a>
            <a href="#integrations">Integrations</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-secondary" data-testid="header-login-link">Sign In</Link>
            <Link to="/register" className="btn-primary" data-testid="header-register-link">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative border-b border-[color:var(--border-line)]">
        <div className="absolute inset-0 swiss-grid-bg opacity-50 pointer-events-none" />
        <div className="relative max-w-[1280px] mx-auto px-8 pt-20 pb-24 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-7">
            <div className="label-tag mb-6 flex items-center gap-2">
              <span className="dot dot-green" /> AI · OCR · INTELLIGENT EXTRACTION
            </div>
            <h1 className="font-display text-5xl md:text-7xl leading-[0.92] tracking-tighter">
              Turn paper into<br />
              <span className="bg-[color:var(--brand-primary)] text-white px-2">structured data</span><br />
              in seconds.
            </h1>
            <p className="mt-6 text-base md:text-lg text-[color:var(--text-secondary)] max-w-xl leading-relaxed">
              Enterprise-grade document intelligence platform that digitizes Delivery Challans, invoices,
              GRNs, e-way bills and purchase documents. Side-by-side review, validation rules, multi-tenant
              RBAC, and ERP-ready exports.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <Link to="/register" className="btn-primary inline-flex items-center gap-2" data-testid="hero-cta-register">
                Start free trial <ArrowRight size={16} weight="bold" />
              </Link>
              <Link to="/login" className="btn-secondary" data-testid="hero-cta-login">Sign in</Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              <Stat n="98.4%" l="OCR ACCURACY" />
              <Stat n="14×" l="FASTER" />
              <Stat n="0" l="MANUAL ENTRY" />
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="swiss-card p-6">
              <div className="label-tag flex items-center justify-between mb-3">
                <span>EXTRACTION PREVIEW</span>
                <span className="dot dot-green" />
              </div>
              <div className="font-mono text-xs leading-6 space-y-1">
                <Row k="doc_type" v="invoice" />
                <Row k="vendor_name" v="Acme Industries Pvt Ltd" />
                <Row k="vendor_gstin" v="29ABCDE1234F1Z5" hi />
                <Row k="invoice_number" v="INV-2026-0042" hi />
                <Row k="invoice_date" v="2026-02-12" />
                <Row k="subtotal" v="₹ 84,200.00" />
                <Row k="cgst" v="₹ 7,578.00" />
                <Row k="sgst" v="₹ 7,578.00" />
                <Row k="total_amount" v="₹ 99,356.00" hi />
                <Row k="confidence" v="0.964" />
              </div>
              <div className="mt-4 pt-3 border-t border-[color:var(--border-line)] flex items-center justify-between text-xs">
                <span className="label-tag">VALIDATIONS</span>
                <span className="status-pill"><span className="dot dot-green" /> 4/4 PASSED</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-[color:var(--border-line)]">
        <div className="max-w-[1280px] mx-auto px-8 py-20">
          <div className="grid md:grid-cols-12 gap-8 mb-12">
            <div className="md:col-span-4">
              <div className="label-tag mb-3">CAPABILITIES</div>
              <h2 className="font-display text-3xl md:text-4xl tracking-tighter">
                Built for finance, ops, and the warehouse floor.
              </h2>
            </div>
            <div className="md:col-span-8 text-[color:var(--text-secondary)] text-base leading-relaxed">
              Every document type, every business rule. Review extracted fields side-by-side with the
              source scan. Approve, reject, correct, export — all under role-based access.
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border border-[color:var(--border-line)] -m-px">
            <Feature icon={FileText} title="Multi-format ingest" desc="Image, PDF, mobile camera, bulk upload, email — automatic doc-type detection." />
            <Feature icon={Pulse} title="Side-by-side review" desc="Resizable dual-pane viewer with bounding boxes, edit fields, approve in one flow." />
            <Feature icon={ShieldCheck} title="Validation rules" desc="GST format, duplicates, PO/GRN match, mandatory fields, confidence routing." />
            <Feature icon={Lightning} title="API-first" desc="OpenAPI/Swagger, JWT, webhooks, async processing, ERP-ready exports." />
            <Feature icon={Users} title="Multi-tenant RBAC" desc="Org isolation. Admin · Operations · Finance · Warehouse · Manager." />
            <Feature icon={ChartLineUp} title="Operational dashboards" desc="Volume, accuracy, pending queue, vendor analytics, 14-day trends." />
            <Feature icon={BarcodeIcon} title="Barcode & QR" desc="Reads barcodes, QRs, e-way bill numbers, transport details, signatures." />
            <Feature icon={Cube} title="ERP-ready exports" desc="Excel (multi-sheet), CSV, JSON, XML — configurable customer templates." />
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="border-b border-[color:var(--border-line)]">
        <div className="max-w-[1280px] mx-auto px-8 py-20">
          <div className="label-tag mb-3">PIPELINE</div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter mb-10">From scan to ledger in four steps.</h2>
          <div className="grid md:grid-cols-4 gap-0 border border-[color:var(--border-line)]">
            <Step n="01" t="Capture" d="Drag-drop, mobile camera, bulk, email forwarder." />
            <Step n="02" t="Extract" d="Vision AI parses fields, line items, taxes, signatures." />
            <Step n="03" t="Validate" d="Business rules verify GSTIN, duplicates, totals." />
            <Step n="04" t="Approve & Export" d="Reviewed → exported to Excel / ERP / API." />
          </div>
        </div>
      </section>

      {/* Integrations strip */}
      <section id="integrations" className="border-b border-[color:var(--border-line)]">
        <div className="max-w-[1280px] mx-auto px-8 py-14">
          <div className="label-tag mb-6">INTEGRATIONS · ARCHITECTED FOR ENTERPRISE</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-0 border border-[color:var(--border-line)]">
            {["ODOO", "SAP", "ORACLE ERP", "MS DYNAMICS", "TALLY", "WEBHOOKS"].map((n) => (
              <div key={n} className="border-r last:border-r-0 border-b md:border-b-0 border-[color:var(--border-line)] p-6 font-mono text-sm font-semibold tracking-tight">
                {n}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[color:var(--brand-primary)] text-white">
        <div className="max-w-[1280px] mx-auto px-8 py-20 grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-8">
            <div className="label-tag !text-white/60 mb-3">START NOW</div>
            <h2 className="font-display text-4xl md:text-5xl tracking-tighter">
              Stop typing. Start <span className="bg-[color:var(--accent-yellow)] text-black px-2">extracting.</span>
            </h2>
          </div>
          <div className="md:col-span-4 flex md:justify-end gap-3">
            <Link to="/register" className="bg-white text-black px-6 py-3 font-semibold text-sm rounded-sm" data-testid="footer-cta-register">Get started</Link>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-[1280px] mx-auto px-8 py-6 flex items-center justify-between text-xs label-tag !text-white/60">
            <span>© 2026 DOCINTEL · ENTERPRISE</span>
            <span>BUILT WITH GEMINI · FASTAPI · MONGODB</span>
          </div>
        </div>
      </section>
    </div>
  );
}

const Stat = ({ n, l }) => (
  <div>
    <div className="font-display text-2xl">{n}</div>
    <div className="label-tag mt-1">{l}</div>
  </div>
);

const Row = ({ k, v, hi }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-[color:var(--text-secondary)]">{k}</span>
    <span className={hi ? "bg-[color:var(--accent-yellow)] px-1" : ""}>{v}</span>
  </div>
);

const Feature = ({ icon: Icon, title, desc }) => (
  <div className="border-r border-b border-[color:var(--border-line)] p-6 hover:bg-[color:var(--bg-surface)]">
    <Icon size={22} weight="bold" />
    <div className="font-display text-lg mt-4">{title}</div>
    <div className="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">{desc}</div>
  </div>
);

const Step = ({ n, t, d }) => (
  <div className="border-r last:border-r-0 border-b md:border-b-0 border-[color:var(--border-line)] p-8">
    <div className="font-mono text-xs label-tag mb-3">{n}</div>
    <div className="font-display text-2xl mb-2">{t}</div>
    <div className="text-sm text-[color:var(--text-secondary)] leading-relaxed">{d}</div>
  </div>
);
