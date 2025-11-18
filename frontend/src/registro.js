import React, { useState } from "react";
import api from "./api";
import BoletaDigital from "./BoletaDigital";

function Registro() {
  const [adultos, setAdultos] = useState(1);
  const [ninos, setNinos] = useState(0);
  const [adultosData, setAdultosData] = useState([]);
  const [ninosData, setNinosData] = useState([]);
  const [acepta, setAcepta] = useState(false);
  const [qrsGenerados, setQrsGenerados] = useState([]);

  const handleContinuar = () => {
    const nuevosAdultos = Array.from({ length: adultos }, () => ({
      nombre: "",
      correo: "",
      identificacion: "",
    }));
    const nuevosNinos = Array.from({ length: ninos }, () => ({
      nombre: "",
      nacimiento: "",
    }));
    setAdultosData(nuevosAdultos);
    setNinosData(nuevosNinos);
  };

  const actualizarAdulto = (index, campo, valor) => {
    const copia = [...adultosData];
    copia[index][campo] = valor;
    setAdultosData(copia);
  };

  const actualizarNino = (index, campo, valor) => {
    const copia = [...ninosData];
    copia[index][campo] = valor;
    setNinosData(copia);
  };

  const registrar = async (e) => {
    e.preventDefault();
    if (!acepta) {
      alert("⚠️ Debes aceptar el tratamiento de datos personales");
      return;
    }

    // Crear grupo con tipo
    const grupo = [
      ...adultosData.map((a) => ({
        ...a,
        tipo: "adulto",
        nacimiento: null,
      })),
      ...ninosData.map((n) => ({
        ...n,
        tipo: "niño",
        correo: null,
        identificacion: null,
      })),
    ];

    try {
      const res = await api.post("/asistentes/grupo", { grupo });
      setQrsGenerados(res.data.qrs);
    } catch (err) {
      alert("Error: " + err.response?.data || "Error inesperado");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-center">
        Registro de Entradas Gratuitas 🎟️
      </h2>

      {qrsGenerados.length === 0 ? (
        <>
          <div className="bg-white p-4 rounded shadow mb-4">
            <h3 className="font-semibold mb-2">1️⃣ Selección de asistentes</h3>
            <label className="block mb-2">
              Adultos (mayores de 7 años):
              <input
                type="number"
                value={adultos}
                placeholder="0"
                onChange={(e) => setAdultos(parseInt(e.target.value))}
                min="1"
                className="border p-1 ml-2 rounded w-20"
              />
            </label>
            <label className="block mb-2">
              Niños (menores de 7 años):
              <input
                type="number"
                placeholder="0"
                value={ninos}
                onChange={(e) => setNinos(parseInt(e.target.value))}
                min="0"
                className="border p-1 ml-2 rounded w-20"
              />
            </label>
            <button
              type="button"
              onClick={handleContinuar}
              className="mt-3 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Continuar
            </button>
          </div>

          {(adultosData.length > 0 || ninosData.length > 0) && (
            <form onSubmit={registrar} className="bg-white p-4 rounded shadow">
              <h3 className="font-semibold mb-3">2️⃣ Datos de los asistentes</h3>

              {adultosData.map((a, i) => (
                <div key={i} className="border p-3 mb-2 rounded">
                  <h4 className="font-medium mb-1">Adulto {i + 1}</h4>
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={a.nombre}
                    onChange={(e) =>
                      actualizarAdulto(i, "nombre", e.target.value)
                    }
                    required
                    className="border p-1 rounded w-full mb-2"
                  />
                  <input
                    type="email"
                    placeholder="Correo"
                    value={a.correo}
                    onChange={(e) =>
                      actualizarAdulto(i, "correo", e.target.value)
                    }
                    required
                    className="border p-1 rounded w-full mb-2"
                  />
                  <input
                    type="text"
                    placeholder="Número de identificación"
                    value={a.identificacion}
                    onChange={(e) =>
                      actualizarAdulto(i, "identificacion", e.target.value)
                    }
                    required
                    className="border p-1 rounded w-full"
                  />
                </div>
              ))}

              {ninosData.map((n, i) => (
                <div key={i} className="border p-3 mb-2 rounded bg-yellow-50">
                  <h4 className="font-medium mb-1">Niño {i + 1}</h4>
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={n.nombre}
                    onChange={(e) =>
                      actualizarNino(i, "nombre", e.target.value)
                    }
                    required
                    className="border p-1 rounded w-full mb-2"
                  />
                  <label className="text-sm text-gray-600 block mb-1">
                    Fecha de nacimiento:
                  </label>
                  <input
                    type="date"
                    value={n.nacimiento}
                    onChange={(e) =>
                      actualizarNino(i, "nacimiento", e.target.value)
                    }
                    required
                    className="border p-1 rounded w-full"
                  />
                </div>
              ))}

              <div className="mt-4">
                <label className="flex items-start text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={acepta}
                    onChange={(e) => setAcepta(e.target.checked)}
                    className="mt-1 mr-2"
                  />
                  Acepto el tratamiento de mis datos personales conforme a la
                  Ley 1581 de 2012 y autorizo el uso de mi información para
                  fines relacionados con este evento.
                </label>
              </div>

              <button
                type="submit"
                className="mt-4 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
              >
                Registrar
              </button>
            </form>
          )}
        </>
      ) : (
        <div className="text-center">
          <h3 className="font-semibold mb-3">🎉 Registro exitoso</h3>
          <p className="mb-3">Estos son tus boletas digitales:</p>

          {qrsGenerados.map((qr, i) => (
            <BoletaDigital
              key={i}
              nombre={qr.nombre}
              documento={qr.identificacion || "N/A"}
              qr={qr.qr}
              numeroBoleta={qr.numero_boleta}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Registro;
