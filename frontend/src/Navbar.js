import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    let message = "";
    try {
      await logout();
    } catch (error) {
      message = error.message;
    }
    navigate("/login", {
      replace: true,
      state: message ? { message } : undefined,
    });
  };

  return (
    <nav className="app-nav" aria-label="Navegación principal">
      <Link to={user ? "/validar" : "/inscripcion"} className="brand-link">
        <img src="/logo512.png" alt="" className="brand-logo" />
        <span>Concierto Navidad</span>
      </Link>

      {!isLoading && user && (
        <div className="nav-content">
          <div className="nav-links">
            <NavLink to="/validar">Verificar QR</NavLink>
            {user.rol === "ADMIN" && (
              <>
                <NavLink to="/asistentes">Asistentes</NavLink>
                <NavLink to="/capacidad">Capacidad</NavLink>
                <NavLink to="/usuarios">Gestión de usuarios</NavLink>
              </>
            )}
            {!isLoading && !user && (
              <div className="nav-links">
                <NavLink to="/inscripcion">Inscripción pública</NavLink>
                <NavLink to="/login">Acceso administrativo</NavLink>
              </div>
            )}
          </div>
          <div className="account-info">
            <span className="account-role">{user.rol}</span>
            <button type="button" className="nav-logout" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
