import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "./api";
import { useAuth } from "./AuthContext";

function Login() {
  const { login, authError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      await login({ email, password });
      navigate(location.state?.from?.pathname || "/validar", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "No se pudo iniciar sesión. Verifica tus datos."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell login-shell">
      <section className="panel login-panel" aria-labelledby="login-title">
        <div className="header-ornament" aria-hidden="true">✦ ✧ ✦</div>
        <h1 id="login-title">Acceso al evento</h1>
        <p className="page-subtitle">Ingresa con la cuenta asignada al personal.</p>

        {(error || authError || location.state?.message) && (
          <div className="notice notice-error" role="alert">
            {error || authError || location.state.message}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            autoComplete="username"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default Login;
