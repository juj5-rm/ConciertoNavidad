import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Registro from "./registro";
import Validacion from "./validacion";
import Informe from "./informe";
import ConsultaEntradas from "./ConsultaEntradas";
import Navbar from "./Navbar";

function App() {
  return (
    <Router>
      <Navbar />

      <div className="p-4 text-center">
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
