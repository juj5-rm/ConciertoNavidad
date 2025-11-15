import React, { useRef, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { QRCodeSVG } from "qrcode.react";
import "./BoletaDigital.css";

function BoletaDigital({ nombre, documento, qr, numeroBoleta }) {
  const numeroFormateado = String(numeroBoleta).padStart(3, "0");
  const frenteExportRef = useRef();
  const reversoExportRef = useRef();

  const [previewFrente, setPreviewFrente] = useState(null);
  const [previewReverso, setPreviewReverso] = useState(null);

  // -----------------------------------------------------------
  const capturar = async (ref) => {
    const canvas = await html2canvas(ref.current, {
      scale: 1,
      useCORS: true,
    });

    return canvas.toDataURL("image/png");
  };

  // 🚀 GENERAR PREVIEW AL CARGAR O CAMBIAR DATOS
  useEffect(() => {
    const generarPreview = async () => {
      const img1 = await capturar(frenteExportRef);
      const img2 = await capturar(reversoExportRef);

      setPreviewFrente(img1);
      setPreviewReverso(img2);
    };

    generarPreview();
  }, [nombre, documento, qr]);

  // -----------------------------------------------------------
  const descargarPNG = async () => {
    const frente = await capturar(frenteExportRef);
    const reverso = await capturar(reversoExportRef);

    const link1 = document.createElement("a");
    link1.download = `boleta-${documento}-frente.png`;
    link1.href = frente;
    link1.click();

    const link2 = document.createElement("a");
    link2.download = `boleta-${documento}-reverso.png`;
    link2.href = reverso;
    link2.click();
  };

  const descargarPDF = async () => {
    const frente = await capturar(frenteExportRef);
    const reverso = await capturar(reversoExportRef);

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [2000, 647],
    });

    pdf.addImage(frente, "PNG", 0, 0, 2000, 647);
    pdf.addPage();
    pdf.addImage(reverso, "PNG", 0, 0, 2000, 647);

    pdf.save(`boleta-${documento}.pdf`);
  };

  return (
    <div className="flex flex-col items-center gap-10 pb-10">
      {/* PREVIEW AUTOMÁTICA GENERADA */}
      <div className="preview-wrapper">
        {previewFrente ? (
          <img
            src={previewFrente}
            alt="Vista previa frente"
            className="boleta-visible"
          />
        ) : (
          <p>Generando vista previa...</p>
        )}
      </div>
      {/* PREVIEW AUTOMÁTICA GENERADA */}
      <div className="preview-wrapper">
        {previewReverso ? (
          <img
            src={previewReverso}
            alt="Vista previa reverso"
            className="boleta-visible"
          />
        ) : (
          <p>Generando vista previa...</p>
        )}
      </div>

      {/* HIDDEN EXPORT DOM */}
      <div className="hidden-boleta">
        <div
          ref={frenteExportRef}
          className="boleta-real"
          style={{
            width: "2000px",
            height: "647px",
            backgroundImage: "url(/FRENTE_IMG.png)",
            backgroundSize: "cover",
          }}
        >
          <div className="abs numero-boleta">
            Boleta N°:
            <div>{numeroFormateado}</div>
          </div>

          <div className="abs qr">
            <div style={{ width: "320px" }}>
              <QRCodeSVG value={qr || ""} width="100%" height="100%" />
            </div>
          </div>
        </div>
      </div>

      <div className="hidden-boleta">
        <div
          ref={reversoExportRef}
          className="boleta-real"
          style={{
            width: "2000px",
            height: "647px",
            backgroundImage: "url(/REVERSO_IMG.png)",
            backgroundSize: "cover",
          }}
        >
          <div className="content">
            <div class="content-rotado">
              <div className="nombre">{nombre}</div>              
              <div className="documento">{documento}</div>
              <div className="numero-boleta-reverso">
                Boleta N°: {numeroFormateado}
              </div>
              <div className="id">{qr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTONES */}
      <div className="flex gap-5">
        <button onClick={descargarPNG} className="btn green">
          Descargar PNG (2 imágenes)
        </button>
        <button onClick={descargarPDF} className="btn red">
          Descargar PDF (2 páginas)
        </button>
      </div>
    </div>
  );
}

export default BoletaDigital;
