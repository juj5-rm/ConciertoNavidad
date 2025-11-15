import React, { useState } from "react";
import api from "./api";
import BoletaDigital from "./BoletaDigital";

function ConsultaEntradas() {
  const [documento, setDocumento] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  const buscar = async () => {
    setError("");
    setResultado(null);

    if (!documento.trim()) {
      setError("Debes ingresar un documento");
      return;
    }

    try {
      const res = await api.get(`/asistentes/documento/${documento}`);
      setResultado(res.data);
      console.log(res.data);
    } catch (err) {
      setError(err.response?.data || "Error al buscar");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4 text-center">
        Consulta de Entradas 🎟️
      </h2>

      {/* BUSCADOR */}
      <div className="bg-white p-4 rounded shadow mb-4">
        <label className="block mb-2 font-medium">
          Documento del asistente:
        </label>
        <input
          type="text"
          placeholder="Ingrese número de identificación"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          className="border p-2 rounded w-full"
        />
        <button
          onClick={buscar}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
        >
          Buscar
        </button>

        {error && (
          <p className="mt-3 text-red-600 text-sm text-center">{error}</p>
        )}
      </div>

      {/* RESULTADO */}
      {resultado && (
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold text-lg mb-4">
            Resultado de la búsqueda
          </h3>

          {/* ► Mostrar líder */}
          <BoletaDigital
            nombre={resultado.lider.nombre}
            documento={resultado.lider.identificacion}
            qr={resultado.lider.codigo_qr}
            numeroBoleta={resultado.lider.numero_boleta}
          />

          {/* ► Miembros */}
          <h4 className="font-medium mb-2">👥 Miembros del grupo</h4>

          {resultado.grupo.length === 0 ? (
            <p className="text-sm text-gray-600">
              No hay miembros registrados.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {resultado.grupo.map((m, i) => (
                <div key={i} className="p-3 border rounded bg-gray-50">
                  <p>
                    <strong>Nombre:</strong> {m.nombre}
                  </p>
                  <p>
                    <strong>Documento:</strong>{" "}
                    {m.identificacion ? m.identificacion : "N/A"}
                  </p>
                  <p>
                    <strong>Tipo:</strong>{" "}
                    {m.tipo === "niño" ? "Niño" : "Adulto"}
                  </p>

                  <BoletaDigital
                    nombre={m.nombre}
                    documento={m.identificacion || "N/A"}
                    qr={m.codigo_qr}
                    numeroBoleta={m.numero_boleta}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConsultaEntradas;
