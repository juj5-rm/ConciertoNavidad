import React, { useEffect, useState } from "react";
import api, { getApiErrorMessage } from "./api";

const EMPTY_SNAPSHOT = {
  capacidadMaxima: null,
  asistentesRegistrados: 0,
  reservasVigentes: 0,
  ocupacionTotal: 0,
  disponibles: 0,
};

function Capacidad() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [capacityInput, setCapacityInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/capacidad")
      .then(({ data }) => {
        if (!active) return;
        setSnapshot(data);
        setCapacityInput(String(data.capacidadMaxima));
      })
      .catch((requestError) => {
        if (active)
          setError(
            getApiErrorMessage(
              requestError,
              "No se pudo consultar la capacidad.",
            ),
          );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = capacityInput.trim();
    const value = Number(trimmed);
    if (
      !/^[1-9]\d*$/.test(trimmed) ||
      !Number.isInteger(value) ||
      value > 2147483647
    ) {
      setError(
        "La capacidad debe ser un entero positivo válido para el sistema.",
      );
      setSuccess("");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.patch("/capacidad", {
        capacidadMaxima: value,
      });
      setSnapshot(data);
      setCapacityInput(String(data.capacidadMaxima));
      setSuccess("La capacidad se actualizó correctamente.");
    } catch (requestError) {
      setError(
        requestError.response?.status === 400
          ? "La solicitud no es válida. Confirma que la capacidad sea un entero positivo y no menor a la ocupación actual."
          : getApiErrorMessage(
              requestError,
              "No se pudo modificar la capacidad.",
            ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="page-heading">
        <h1>Capacidad del evento</h1>
        <p className="subtitle">
          Ocupación y disponibilidad actualizadas desde el servidor.
        </p>
        <div className="gold-line" />
      </header>

      <section className="panel">
        {isLoading ? (
          <p className="loading-message" role="status">
            Cargando capacidad...
          </p>
        ) : error && snapshot.capacidadMaxima === null ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : (
          <>
            <div className="capacity-grid">
              <article className="capacity-card">
                <span>Capacidad máxima</span>
                <strong>{snapshot.capacidadMaxima}</strong>
              </article>
              <article className="capacity-card">
                <span>Asistentes registrados</span>
                <strong>{snapshot.asistentesRegistrados}</strong>
              </article>
              <article className="capacity-card">
                <span>Reservas pendientes vigentes</span>
                <strong>{snapshot.reservasVigentes}</strong>
              </article>
              <article className="capacity-card">
                <span>Ocupación total</span>
                <strong>{snapshot.ocupacionTotal}</strong>
              </article>
              <article className="capacity-card capacity-card-accent">
                <span>Disponibilidad</span>
                <strong>{snapshot.disponibles}</strong>
              </article>
            </div>

            <form className="capacity-form" onSubmit={handleSubmit}>
              <label htmlFor="capacidadMaxima">Nueva capacidad máxima</label>
              <div className="manual-code-row">
                <input
                  id="capacidadMaxima"
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  value={capacityInput}
                  onChange={(event) => setCapacityInput(event.target.value)}
                  disabled={isSaving}
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? "Guardando..." : "Actualizar capacidad"}
                </button>
              </div>
              <p className="field-hint">
                Debe ser un entero positivo y no puede ser menor a la ocupación
                actual.
              </p>
            </form>

            {error && (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="notice notice-success" role="status">
                {success}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default Capacidad;
