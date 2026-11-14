import React, { useRef, useState } from "react";
import { useZxing } from "react-zxing";
import api, { getApiErrorMessage } from "./api";

function formatDate(value) {
  if (!value) return "No disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No disponible" : date.toLocaleString();
}

function Validacion() {
  const [codigoQr, setCodigoQr] = useState("");
  const [verification, setVerification] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const verificationLocked = useRef(false);

  const verificarCodigo = async (value) => {
    if (verificationLocked.current || !value) return;

    verificationLocked.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    setVerification(null);

    try {
      const response = await api.post("/asistentes/verificar-qr", {
        codigoQr: value,
      });
      setVerification(response.data);
      setCodigoQr("");
    } catch (error) {
      setErrorMessage(
        error.response?.status === 404
          ? "No se encontró una entrada con ese código."
          : getApiErrorMessage(error, "No fue posible verificar la entrada."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const { ref } = useZxing({
    onDecodeResult(result) {
      if (!verificationLocked.current) {
        verificarCodigo(result.getText());
      }
    },
    onError() {
      setCameraError("No se pudo iniciar la cámara. Puedes ingresar el código manualmente.");
    },
    constraints: { video: { facingMode: "environment" } },
  });

  const handleManualSubmit = (event) => {
    event.preventDefault();
    verificarCodigo(codigoQr.trim());
  };

  const clearResult = () => {
    verificationLocked.current = false;
    setVerification(null);
    setErrorMessage("");
    setCameraError("");
  };

  const isRegistered = verification?.resultado === "INGRESO_REGISTRADO";

  return (
    <main className="app-shell">
      <header className="page-heading">
        <h1>Verificación de entradas</h1>
        <p className="subtitle">Escanea el código QR o ingrésalo manualmente.</p>
        <div className="gold-line" />
      </header>

      <section className="panel scanner-panel" aria-label="Verificar entrada">
        <div className="scanner-frame">
          <video ref={ref} className="scanner-video" aria-label="Vista de la cámara" />
        </div>
        <p className="scanner-help">
          Coloca el código QR dentro del recuadro. La verificación se envía una sola vez.
        </p>
        {cameraError && <p className="notice notice-info" role="status">{cameraError}</p>}

        <form className="manual-code-form" onSubmit={handleManualSubmit}>
          <label htmlFor="codigoQr">Código QR</label>
          <div className="manual-code-row">
            <input
              id="codigoQr"
              type="text"
              value={codigoQr}
              onChange={(event) => setCodigoQr(event.target.value)}
              autoComplete="off"
              disabled={isSubmitting}
              placeholder="Ingresa el código de la entrada"
            />
            <button className="primary-button" type="submit" disabled={isSubmitting || !codigoQr.trim()}>
              {isSubmitting ? "Verificando..." : "Verificar"}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="notice notice-error result-notice" role="alert">
            <strong>Entrada no verificada</strong>
            <span>{errorMessage}</span>
            <button type="button" className="secondary-button" onClick={clearResult}>
              Intentar otra vez
            </button>
          </div>
        )}

        {verification && (
          <div
            className={`notice result-notice ${isRegistered ? "notice-success" : "notice-warning"}`}
            role="status"
          >
            <strong>
              {isRegistered
                ? "Ingreso registrado"
                : "Entrada ya utilizada"}
            </strong>
            <span>
              {isRegistered
                ? "La entrada quedó validada correctamente."
                : "Esta entrada ya había sido validada."}
            </span>
            <dl className="verification-details">
              <div><dt>Número de boleta</dt><dd>{verification.numeroBoleta}</dd></div>
              <div><dt>Tipo de asistente</dt><dd>{verification.tipo}</dd></div>
              <div><dt>Fecha de validación</dt><dd>{formatDate(verification.validadoAt)}</dd></div>
            </dl>
            <button type="button" className="secondary-button" onClick={clearResult}>
              Verificar otra entrada
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default Validacion;
