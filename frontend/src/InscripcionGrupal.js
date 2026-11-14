import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import api, { getApiErrorMessage } from "./api";
import "./InscripcionGrupal.css";

const CONSENT_VERSION = "2026-11-13-v1";
const CONSENT_TEXT =
  "Acepto el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y autorizo el uso de mi información para fines relacionados con este evento.";

const newAdult = () => ({ nombre: "", correo: "", identificacion: "" });
const newChild = () => ({ nombre: "", nacimiento: "" });

function isChildUnderSeven(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split("-").map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  )
    return false;
  const today = new Date();
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 7;
}

function InscripcionGrupal() {
  const [adultos, setAdultos] = useState([newAdult()]);
  const [ninos, setNinos] = useState([]);
  const [step, setStep] = useState("form");
  const [consentimiento, setConsentimiento] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [asistentesRegistrados, setAsistentesRegistrados] = useState([]);

  const updateAdult = (index, field, value) => {
    setAdultos((current) =>
      current.map((adulto, itemIndex) =>
        itemIndex === index ? { ...adulto, [field]: value } : adulto,
      ),
    );
  };

  const updateChild = (index, field, value) => {
    setNinos((current) =>
      current.map((nino, itemIndex) =>
        itemIndex === index ? { ...nino, [field]: value } : nino,
      ),
    );
  };

  const reviewRegistration = (event) => {
    event.preventDefault();
    const invalidAdult = adultos.some(
      ({ nombre, correo, identificacion }) =>
        !nombre.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) ||
        !identificacion.trim(),
    );
    const invalidChild = ninos.some(
      ({ nombre, nacimiento }) =>
        !nombre.trim() || !isChildUnderSeven(nacimiento),
    );

    if (invalidAdult || invalidChild) {
      setError(
        "Completa los datos de cada adulto y niño. Verifica los correos y que los niños sean menores de 7 años.",
      );
      return;
    }

    setError("");
    setStep("review");
  };

  const confirmRegistration = async () => {
    if (!consentimiento) {
      setError("Debes aceptar el tratamiento de datos antes de confirmar.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const { data } = await api.post("/grupos/inscripcion", {
        adultos: adultos.map(({ nombre, correo, identificacion }) => ({
          nombre: nombre.trim(),
          correo: correo.trim(),
          identificacion: identificacion.trim(),
        })),
        ninos: ninos.map(({ nombre, nacimiento }) => ({
          nombre: nombre.trim(),
          nacimiento,
        })),
        consentimientoAceptado: true,
        consentimientoVersion: CONSENT_VERSION,
      });
      setAsistentesRegistrados(data.asistentes);
      setStep("complete");
    } catch (requestError) {
      setError(
        requestError.response?.status === 409
          ? "No hay cupos suficientes para todo el grupo. No se registró ningún asistente."
          : getApiErrorMessage(
              requestError,
              "No fue posible completar la inscripción. Revisa los datos e inténtalo nuevamente.",
            ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell registration-shell">
      <header className="page-heading">
        <h1>Inscripción al concierto</h1>
        <p className="subtitle">
          Registra a los integrantes de tu grupo en una sola inscripción.
        </p>
        <div className="gold-line" />
      </header>

      {step === "form" && (
        <section className="panel registration-panel">
          <form onSubmit={reviewRegistration} noValidate>
            <div className="registration-section-heading">
              <div>
                <h2>Adultos</h2>
                <p>El primer adulto será el responsable del grupo.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setAdultos((current) => [...current, newAdult()])
                }
              >
                Agregar adulto
              </button>
            </div>

            <div className="registration-attendee-list">
              {adultos.map((adulto, index) => (
                <fieldset
                  className="registration-attendee"
                  key={`adult-${index}`}
                >
                  <legend>
                    {index === 0
                      ? "Responsable del grupo"
                      : `Adulto ${index + 1}`}
                  </legend>
                  {index > 0 && (
                    <button
                      className="registration-remove"
                      type="button"
                      onClick={() =>
                        setAdultos((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Quitar adulto ${index + 1}`}
                    >
                      Quitar
                    </button>
                  )}
                  <div className="registration-fields">
                    <label>
                      Nombre completo
                      <input
                        autoComplete="name"
                        required
                        value={adulto.nombre}
                        onChange={(event) =>
                          updateAdult(index, "nombre", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Correo electrónico
                      <input
                        autoComplete="email"
                        type="email"
                        required
                        value={adulto.correo}
                        onChange={(event) =>
                          updateAdult(index, "correo", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Identificación
                      <input
                        autoComplete="off"
                        required
                        value={adulto.identificacion}
                        onChange={(event) =>
                          updateAdult(
                            index,
                            "identificacion",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="registration-section-heading registration-children-heading">
              <div>
                <h2>Niños</h2>
                <p>La inscripción infantil aplica a menores de 7 años.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setNinos((current) => [...current, newChild()])}
              >
                Agregar niño
              </button>
            </div>

            {ninos.length > 0 && (
              <div className="registration-attendee-list">
                {ninos.map((nino, index) => (
                  <fieldset
                    className="registration-attendee"
                    key={`child-${index}`}
                  >
                    <legend>Niño {index + 1}</legend>
                    <button
                      className="registration-remove"
                      type="button"
                      onClick={() =>
                        setNinos((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Quitar niño ${index + 1}`}
                    >
                      Quitar
                    </button>
                    <div className="registration-fields registration-child-fields">
                      <label>
                        Nombre completo
                        <input
                          required
                          value={nino.nombre}
                          onChange={(event) =>
                            updateChild(index, "nombre", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Fecha de nacimiento
                        <input
                          type="date"
                          required
                          value={nino.nacimiento}
                          onChange={(event) =>
                            updateChild(index, "nacimiento", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            {error && (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            )}
            <div className="registration-actions">
              <button className="primary-button" type="submit">
                Revisar inscripción
              </button>
            </div>
          </form>
        </section>
      )}

      {step === "review" && (
        <section
          className="panel registration-panel"
          aria-labelledby="review-title"
        >
          <h2 id="review-title">Revisa tu grupo</h2>
          <p>Confirma los datos antes de generar las boletas.</p>
          <div className="registration-summary">
            {adultos.map((adulto, index) => (
              <article
                className="registration-summary-item"
                key={`adult-${index}`}
              >
                <strong>
                  {index === 0 ? "Responsable" : `Adulto ${index + 1}`} ·{" "}
                  {adulto.nombre.trim()}
                </strong>
                <span>{adulto.correo.trim()}</span>
                <span>Identificación: {adulto.identificacion.trim()}</span>
              </article>
            ))}
            {ninos.map((nino, index) => (
              <article
                className="registration-summary-item"
                key={`child-${index}`}
              >
                <strong>
                  Niño {index + 1} · {nino.nombre.trim()}
                </strong>
                <span>Fecha de nacimiento: {nino.nacimiento}</span>
              </article>
            ))}
          </div>
          <label className="registration-consent">
            <input
              type="checkbox"
              checked={consentimiento}
              onChange={(event) => setConsentimiento(event.target.checked)}
            />
            <span>{CONSENT_TEXT}</span>
          </label>
          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}
          <div className="registration-actions registration-review-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setError("");
                setStep("form");
              }}
            >
              Volver y corregir
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={isSubmitting}
              onClick={confirmRegistration}
            >
              {isSubmitting ? "Confirmando..." : "Confirmar inscripción"}
            </button>
          </div>
        </section>
      )}

      {step === "complete" && (
        <section
          className="panel registration-panel"
          aria-labelledby="complete-title"
        >
          <h2 id="complete-title">Inscripción confirmada</h2>
          <p>Guarda la boleta y el código QR de cada integrante.</p>
          <div className="registration-tickets">
            {asistentesRegistrados.map((asistente) => (
              <article
                className="registration-ticket"
                key={`${asistente.numeroBoleta}-${asistente.codigoQr}`}
              >
                <div>
                  <span className="registration-ticket-type">
                    {asistente.tipo}
                  </span>
                  <h3>{asistente.nombre}</h3>
                  <p>Boleta {asistente.numeroBoleta}</p>
                </div>
                <QRCodeSVG
                  aria-label={`Código QR de la boleta ${asistente.numeroBoleta}`}
                  value={asistente.codigoQr}
                  size={180}
                  level="M"
                />
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default InscripcionGrupal;
