import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import { Toaster } from "sonner";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentUpload from "./pages/DocumentUpload";
import DocumentViewer from "./pages/DocumentViewer";
import Vendors from "./pages/Vendors";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import ApiDocs from "./pages/ApiDocs";

function Shell({ children, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading || user === null) return null;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Shell><Dashboard /></Shell>} />
            <Route path="/documents" element={<Shell><Documents /></Shell>} />
            <Route path="/documents/:id" element={<Shell><DocumentViewer /></Shell>} />
            <Route path="/upload" element={<Shell roles={["admin", "operations"]}><DocumentUpload /></Shell>} />
            <Route path="/vendors" element={<Shell><Vendors /></Shell>} />
            <Route path="/users" element={<Shell roles={["admin", "manager"]}><Users /></Shell>} />
            <Route path="/audit-logs" element={<Shell roles={["admin", "manager"]}><AuditLogs /></Shell>} />
            <Route path="/api-docs" element={<Shell><ApiDocs /></Shell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
