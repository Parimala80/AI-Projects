import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  House, FilePlus, Files, Users, Buildings, ListChecks,
  ChartBar, SignOut, BookOpen, Storefront, Gear,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: ChartBar, roles: null },
  { to: "/documents", label: "Documents", icon: Files, roles: null, badge: "queue" },
  { to: "/upload", label: "Upload", icon: FilePlus, roles: ["admin", "operations"] },
  { to: "/vendors", label: "Vendors", icon: Storefront, roles: null },
  { to: "/users", label: "Users", icon: Users, roles: ["admin", "manager"] },
  { to: "/audit-logs", label: "Audit Logs", icon: ListChecks, roles: ["admin", "manager"] },
  { to: "/settings", label: "Settings", icon: Gear, roles: ["admin"] },
  { to: "/developers", label: "API Reference", icon: BookOpen, roles: null },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visible = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));
  const [queueCount, setQueueCount] = useState(null);
  const [scope, setScope] = useState(null);

  useEffect(() => {
    let alive = true;
    const fetchQueue = async () => {
      try {
        const { data } = await api.get("/dashboard/stats");
        if (!alive) return;
        setQueueCount(data.pending_review ?? 0);
        setScope(data.scope);
      } catch {
        if (alive) setQueueCount(null);
      }
    };
    fetchQueue();
    const id = setInterval(fetchQueue, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen flex bg-[color:var(--bg-base)]">
      <aside
        data-testid="sidebar"
        className="w-[240px] shrink-0 border-r border-[color:var(--border-line)] bg-white flex flex-col sticky top-0 h-screen"
      >
        <div className="px-5 py-5 border-b border-[color:var(--border-line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[color:var(--brand-primary)] flex items-center justify-center">
              <House size={16} color="#fff" weight="bold" />
            </div>
            <div>
              <div className="font-display text-[15px] leading-none">DOCINTEL</div>
              <div className="label-tag mt-0.5">v1.0 · Enterprise</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin py-3">
          {visible.map((item) => {
            const Icon = item.icon;
            const showBadge = item.badge === "queue" && queueCount != null && queueCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm border-l-2 ${
                    isActive
                      ? "border-l-[color:var(--brand-primary)] bg-[color:var(--bg-surface)] text-[color:var(--text-primary)] font-semibold"
                      : "border-l-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]"
                  }`
                }
              >
                <Icon size={17} weight="bold" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span
                    className="bg-[color:var(--accent-yellow)] text-black text-[10px] font-mono font-bold px-1.5 py-0.5 leading-none"
                    title={scope === "own" ? "Your queue" : "Tenant queue"}
                    data-testid="queue-badge"
                  >
                    {queueCount > 99 ? "99+" : queueCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[color:var(--border-line)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[color:var(--bg-surface)] flex items-center justify-center font-mono text-xs font-bold">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" data-testid="current-user-name">{user?.name}</div>
              <div className="label-tag truncate" data-testid="current-user-role">{user?.role}</div>
            </div>
          </div>
          <button
            data-testid="logout-button"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="w-full text-left text-xs label-tag flex items-center gap-2 hover:text-[color:var(--accent-red)]"
          >
            <SignOut size={14} weight="bold" />
            SIGN OUT
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({ kicker, title, description, actions }) {
  return (
    <div
      className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-8 pt-8 pb-6 border-b border-[color:var(--border-line)]"
      data-testid="page-header"
    >
      <div>
        {kicker && <div className="label-tag mb-2">{kicker}</div>}
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-[color:var(--text-secondary)] max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
