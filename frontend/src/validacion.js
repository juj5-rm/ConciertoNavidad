import React, { useState } from "react";
import { useZxing } from "react-zxing";
import api from "./api";

function Validacion() {
  const [modal, setModal] = useState({
    visible: false,
    mensaje: "",
    exito: false,
  });
  const [cameraActive, setCameraActive] = useState(true);

  const { ref } = useZxing({
    onDecodeResult(result) {
      if (!cameraActive) return; // 🚫 si el modal está abierto, no escanea
      const codigo = result.getText();
      validarCodigo(codigo);
    },
    onError(err) {
      console.error("Error de cámara:", err);
    },
    constraints: {
      video: { facingMode: "environment" }, // cámara trasera
    },
  });

  const validarCodigo = async (codigo) => {
    setCameraActive(false); // ⏸️ detener nuevas lecturas
    try {
      const res = await api.post("/validar", { codigo_qr: codigo });

      // Esperar 1 segundo antes de mostrar el modal (efecto natural)
      setTimeout(() => {
        setModal({
          visible: true,
          mensaje: `✅ ${res.data.message}\n${res.data.asistente.nombre}`,
          exito: true,
        });
      }, 1000);
    } catch (err) {
      setTimeout(() => {
        setModal({
          visible: true,
          mensaje: `❌ ${err.response?.data || "Error al validar QR"}`,
          exito: false,
        });
      }, 1000);
    }
  };

  const cerrarModal = () => {
    setModal({ ...modal, visible: false });
    setCameraActive(true); // ▶️ reactivar cámara
  };

  return (
    <div className="p-5 text-center">
      <h1 className="text-2xl font-bold mb-4">Validación de QR 🎫</h1>

      <div className="max-w-md mx-auto relative">
        <video
          ref={ref}
          className={`w-full rounded-lg shadow-md transition-opacity duration-300 ${
            cameraActive ? "opacity-100" : "opacity-40"
          }`}
        />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 text-white text-lg font-medium">
            Pausado...
          </div>
        )}
      </div>

      {/* Modal de validación */}
      {modal.visible && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
        >
          <div
            className={`p-6 rounded-2xl shadow-xl text-white text-center transition-all duration-300 ${
              modal.exito ? "bg-green-500" : "bg-red-500"
            }`}
          >
            <p className="whitespace-pre-line text-lg font-semibold">{modal.mensaje}</p>
            <button
              onClick={cerrarModal}
              className="mt-4 bg-white text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Validacion;
