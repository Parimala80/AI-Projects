import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm label-tag" data-testid="auth-loading">
        Authenticating…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="forbidden">
        <div className="swiss-card p-12 text-center max-w-md">
          <div className="label-tag mb-3">403 — Forbidden</div>
          <div className="font-display text-3xl mb-2">Access denied</div>
          <div className="text-sm text-[color:var(--text-secondary)]">
            Your role <span className="font-mono">{user.role}</span> cannot view this resource.
          </div>
        </div>
      </div>
    );
  }
  return children;
}
