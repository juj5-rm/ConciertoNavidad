import React, { useState, useEffect } from "react";
import api from "./api";
import { QRCodeSVG } from "qrcode.react";

function Informe() {
  const [asistentes, setAsistentes] = useState([]);
  const [qrSeleccionado, setQrSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const obtenerAsistentes = async () => {
    const res = await api.get("/asistentes");
    setAsistentes(res.data);
  };

  useEffect(() => {
    obtenerAsistentes();
  }, []);

  // 🔍 Filtrar por nombre o identificación
  const asistentesFiltrados = asistentes.filter((a) =>
    (a.nombre + " " + (a.identificacion || "")).toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 text-center">
        Informe de Asistentes 📋
      </h2>

      {/* 🔢 Contador de registrados */}
      <p className="text-center mb-4 text-gray-700">
        Total registrados: <strong>{asistentes.length}</strong>
      </p>

      {/* 🔍 Barra de búsqueda */}
      <div className="mb-4 flex justify-center">
        <input
          type="text"
          placeholder="Buscar por nombre o identificación..."
          className="border rounded p-2 w-80 shadow"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <table className="w-full border-collapse bg-white rounded shadow">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Nombre</th>
            <th className="border p-2">Correo</th>
            <th className="border p-2">Identificación / Nacimiento</th>
            <th className="border p-2">QR</th>
            <th className="border p-2">Validado</th>
          </tr>
        </thead>
        <tbody>
          {asistentesFiltrados.map((a) => (
            <tr key={a.id}>
              <td
                className={`border p-2 cursor-pointer ${
                  !a.validado ? "text-blue-600 hover:underline" : "text-gray-500"
                }`}
                onClick={() => setQrSeleccionado(a)}
              >
                {a.nombre}
              </td>
              <td className="border p-2">{a.correo || "-"}</td>
              <td className="border p-2">
                {a.identificacion || a.nacimiento || "-"}
              </td>
              <td className="border p-2 text-xs">{a.codigo_qr}</td>
              <td className="border p-2 text-center">{a.validado ? "✅" : "❌"}</td>
            </tr>
          ))}

          {asistentesFiltrados.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center p-4 text-gray-500">
                No se encontraron resultados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {qrSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl text-center">
            <h2 className="text-lg font-semibold mb-4">
              {qrSeleccionado.nombre}
            </h2>
            <QRCodeSVG value={qrSeleccionado.codigo_qr} size={220} />
            <p className="mt-3 text-sm text-gray-600">
              {qrSeleccionado.codigo_qr}
            </p>
            <button
              onClick={() => setQrSeleccionado(null)}
              className="mt-4 bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Informe;
