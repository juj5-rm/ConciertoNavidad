import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import api, { getApiErrorMessage } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/auth/me");
      setUser(response.data.user);
      setAuthError("");
    } catch (error) {
      setUser(null);
      if (error.response?.status === 401) {
        setAuthError("");
      } else {
        setAuthError(getApiErrorMessage(error, "No se pudo comprobar la sesión."));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setAuthError("Tu sesión expiró. Inicia sesión nuevamente.");
    };

    window.addEventListener("auth:expired", handleExpiredSession);
    return () => window.removeEventListener("auth:expired", handleExpiredSession);
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await api.post("/auth/login", credentials);
    setUser(response.data.user);
    setAuthError("");
    return response.data.user;
  }, []);

  const logout = useCallback(async () => {
    let logoutError;
    try {
      await api.post("/auth/logout");
    } catch (error) {
      logoutError = getApiErrorMessage(error, "No se pudo cerrar la sesión en el servidor.");
    } finally {
      setUser(null);
    }
    if (logoutError) throw new Error(logoutError);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, authError, login, logout, refreshSession }),
    [user, isLoading, authError, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  }
  return context;
}
