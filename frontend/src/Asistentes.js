import React, { useEffect, useState } from "react";
import api, { getApiErrorMessage } from "./api";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function Asistentes() {
  const [asistentes, setAsistentes] = useState([]);
  const [total, setTotal] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/asistentes")
      .then(({ data }) => {
        if (!active) return;
        setAsistentes(data.asistentes);
        setTotal(data.total);
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, "No se pudo cargar el listado."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, []);

  const normalizedSearch = busqueda.trim().toLocaleLowerCase();
  const filteredAttendees = asistentes.filter((asistente) =>
    `${asistente.nombre} ${asistente.numeroBoleta}`.toLocaleLowerCase().includes(normalizedSearch),
  );

  return (
    <main className="app-shell">
      <header className="page-heading">
        <h1>Listado de asistentes</h1>
        <p className="subtitle">Consulta el estado de las entradas registradas.</p>
        <div className="gold-line" />
      </header>

      <section className="panel">
        <div className="list-toolbar">
          <p className="total-count">Total de asistentes: <strong>{total}</strong></p>
          <label className="search-field" htmlFor="busqueda-asistentes">
            <span>Buscar por nombre o boleta</span>
            <input
              id="busqueda-asistentes"
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </label>
        </div>

        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {isLoading ? (
          <p className="loading-message" role="status">Cargando asistentes...</p>
        ) : !error ? (
          <div className="table-scroll">
            <table className="attendees-table">
              <thead>
                <tr>
                  <th scope="col">Boleta</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Validación</th>
                  <th scope="col">Fecha de validación</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendees.map((asistente) => (
                  <tr key={asistente.numeroBoleta}>
                    <td>{asistente.numeroBoleta}</td>
                    <td>{asistente.nombre}</td>
                    <td>{asistente.tipo}</td>
                    <td>
                      <span className={asistente.validado ? "status-badge status-used" : "status-badge"}>
                        {asistente.validado ? "Validada" : "Pendiente"}
                      </span>
                    </td>
                    <td>{formatDate(asistente.validadoAt)}</td>
                  </tr>
                ))}
                {filteredAttendees.length === 0 && (
                  <tr><td colSpan="5" className="empty-row">No se encontraron asistentes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default Asistentes;
