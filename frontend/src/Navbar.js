import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

function Navbar() {
  const [openMenu, setOpenMenu] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const pedirClave = () => {
    const clave = prompt("Ingrese la clave para acceder");
    if (clave === "AVconcierto2025") {
      setAdminUnlocked(true);
      alert("Acceso concedido");
    } else {
      alert("Clave incorrecta");
    }
  };

  return (
    <nav className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between shadow-md">
      {/* LOGO IZQUIERDA */}
      <img src="/logo512.png" alt="Concierto Navidad logo" className="h-[50px]" />

      {/* NAVEGACIÓN DERECHA */}
      <div className="flex items-center gap-6">
        {/* Botón menú móvil */}
        <button className="md:hidden" onClick={() => setOpenMenu(!openMenu)}>
          {openMenu ? <X /> : <Menu />}
        </button>

        {/* Items desktop */}
        <div className="hidden md:flex gap-6">
          <Link to="/" className="hover:text-blue-400">
            Registrar
          </Link>
          <Link to="/consulta" className="hover:text-blue-400">
            Consultar
          </Link>

          {/* Admin */}
          {adminUnlocked && (
            <>
              <Link to="/informe" className="hover:text-blue-400">
                Informe
              </Link>
              <Link to="/validar" className="hover:text-blue-400">
                Validar
              </Link>
            </>
          )}

          {!adminUnlocked && (
            <button onClick={pedirClave} className="text-yellow-400">
              Acceso Admin
            </button>
          )}
        </div>
      </div>

      {/* Menu móvil */}
      {openMenu && (
        <div className="absolute top-16 right-0 w-full bg-gray-900 text-white flex flex-col py-4 px-6 gap-4 md:hidden z-50">
          <Link to="/" onClick={() => setOpenMenu(false)}>
            Registrar
          </Link>
          <Link to="/consulta" onClick={() => setOpenMenu(false)}>
            Consultar
          </Link>

          {adminUnlocked ? (
            <>
              <Link to="/informe" onClick={() => setOpenMenu(false)}>
                Informe
              </Link>
              <Link to="/validar" onClick={() => setOpenMenu(false)}>
                Validar
              </Link>
            </>
          ) : (
            <button onClick={pedirClave} className="text-yellow-400">
              Acceso Admin
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
