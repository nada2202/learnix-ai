import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuthToken, updateStoredUser, apiFetch, readApiJson } from "../services/api";
import { dashboardPathForRole, getStoredUser, normalizeRole, routeAllowedForRole } from "../services/roles";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [restoring, setRestoring] = useState(false);
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  const [restoredUser, setRestoredUser] = useState(null);
  const user = restoredUser || getStoredUser();
  const hasSession = Boolean(user.email);
  const token = getAuthToken();

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      if (hasSession || !token) return;
      setRestoring(true);
      setRestoreAttempted(false);
      try {
        const response = await apiFetch("/api/me");
        const data = await readApiJson(response, "");
        if (!cancelled && data.success && data.user) {
          updateStoredUser(data.user);
          setRestoredUser(data.user);
        }
      } catch {
        // Navigation below will send the user back to login if restoration fails.
      } finally {
        if (!cancelled) {
          setRestoring(false);
          setRestoreAttempted(true);
        }
      }
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [hasSession, token]);

  if (restoring || (!hasSession && token && !restoreAttempted)) {
    return <div className="route-loading">Chargement...</div>;
  }

  if (!hasSession) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(user.role || user.level);

  if (!routeAllowedForRole(location.pathname, role)) {
    return <Navigate to={dashboardPathForRole(role)} replace />;
  }

  return children;
}

export default ProtectedRoute;
