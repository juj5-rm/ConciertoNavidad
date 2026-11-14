import axios from "axios";

const baseURL =
  process.env.NODE_ENV === "production"
    ? "/api"
    : process.env.REACT_APP_API_URL || "http://localhost:3001";

const api = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    const isAuthBootstrapRequest =
      requestUrl === "/auth/login" ||
      requestUrl === "/auth/me" ||
      requestUrl === "/auth/logout";

    if (error.response?.status === 401 && !isAuthBootstrapRequest) {
      window.dispatchEvent(new Event("auth:expired"));
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error, fallback = "No fue posible completar la solicitud.") {
  const status = error.response?.status;

  if (status === 400) return "Revisa los datos e inténtalo nuevamente.";
  if (status === 401) return "Tu sesión expiró. Inicia sesión nuevamente.";
  if (status === 403) return "Tu cuenta no tiene permiso para esta acción.";
  if (status === 404) return "No se encontró la información solicitada.";
  if (status === 409) {
    return "La operación no se puede completar con la ocupación actual.";
  }
  if (!error.response) return "No se pudo conectar con el servidor.";

  return fallback;
}

export default api;
