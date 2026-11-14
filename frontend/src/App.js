import React from "react";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import Navbar from "./Navbar";
import Login from "./Login";
import Validacion from "./validacion";
import Asistentes from "./Asistentes";
import Capacidad from "./Capacidad";
import RequireAuth from "./RequireAuth";
import InscripcionGrupal from "./InscripcionGrupal";
import "./referencia/index.css";
import "./referencia/App.css";
import "./operaciones.css";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Navbar />
        <Routes>
          <Route path="/inscripcion" element={<InscripcionGrupal />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/validar"
            element={
              <RequireAuth roles={["ADMIN", "OPERADOR"]}>
                <Validacion />
              </RequireAuth>
            }
          />
          <Route
            path="/asistentes"
            element={
              <RequireAuth roles={["ADMIN"]}>
                <Asistentes />
              </RequireAuth>
            }
          />
          <Route
            path="/capacidad"
            element={
              <RequireAuth roles={["ADMIN"]}>
                <Capacidad />
              </RequireAuth>
            }
          />
          <Route
            path="/informe"
            element={<Navigate to="/asistentes" replace />}
          />
          <Route path="/" element={<Navigate to="/inscripcion" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
