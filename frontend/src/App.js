import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Registro from "./registro";
import Validacion from "./validacion";
import Informe from "./informe";
import ConsultaEntradas from "./ConsultaEntradas";

function App() {
  return (
    <Router>
      <div className="p-4 text-center">
        <nav className="mb-4 flex justify-center gap-4">
          <Link to="/" className="text-blue-600">Registro</Link>
          <Link to="/validar" className="text-green-600">Validar QR</Link>
          <Link to="/Informe" className="text-yellow-600">Informe</Link>
          <Link to="/consulta" className="text-purple-600">Consulta Entradas</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Registro />} />
          <Route path="/consulta" element={<ConsultaEntradas />} />
          <Route path="/validar" element={<Validacion />} />
          <Route path="/informe" element={<Informe />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
