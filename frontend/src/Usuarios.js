import React, { useEffect, useState } from "react";
import api, { getApiErrorMessage } from "./api";

const EMPTY_FORM = { email: "", password: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getUserErrorMessage(error, fallback) {
  if (error.response?.status === 409) {
    return "Ya existe un operador con ese correo.";
  }
  if (error.response?.status === 400) {
    return "Revisa el correo y la contraseña. La contraseña debe tener al menos 12 caracteres.";
  }
  return getApiErrorMessage(error, fallback);
}

function Usuarios() {
  const [operadores, setOperadores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOperator, setEditingOperator] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/usuarios/operadores")
      .then(({ data }) => {
        if (active) setOperadores(data.operadores);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            getApiErrorMessage(
              requestError,
              "No se pudo cargar la lista de operadores.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openCreateForm = () => {
    setEditingOperator(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError("");
    setSuccess("");
  };

  const openEditForm = (operator) => {
    setEditingOperator(operator);
    setForm({ email: operator.email, password: "" });
    setShowForm(true);
    setError("");
    setSuccess("");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOperator(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccess("");

    const payload = { email: form.email.trim() };
    if (!editingOperator || form.password) payload.password = form.password;

    try {
      const response = editingOperator
        ? await api.patch(
            `/usuarios/operadores/${editingOperator.id}`,
            payload,
          )
        : await api.post("/usuarios/operadores", payload);
      const operator = response.data.operador;

      setOperadores((current) =>
        editingOperator
          ? current.map((item) => (item.id === operator.id ? operator : item))
          : [operator, ...current],
      );
      setSuccess(
        editingOperator
          ? "Los datos del operador se actualizaron."
          : "El operador se creó correctamente.",
      );
      closeForm();
    } catch (requestError) {
      setError(
        getUserErrorMessage(
          requestError,
          "No se pudo guardar el operador.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (operator) => {
    if (
      operator.activo &&
      !window.confirm(
        `¿Desactivar la cuenta de ${operator.email}? Su sesión dejará de funcionar.`,
      )
    ) {
      return;
    }

    setBusyId(operator.id);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.patch(
        `/usuarios/operadores/${operator.id}/estado`,
        { activo: !operator.activo },
      );
      setOperadores((current) =>
        current.map((item) =>
          item.id === operator.id ? data.operador : item,
        ),
      );
      setSuccess(
        data.operador.activo
          ? "El operador se activó correctamente."
          : "El operador se desactivó correctamente.",
      );
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "No se pudo cambiar el estado del operador.",
        ),
      );
    } finally {
      setBusyId("");
    }
  };

  return (
    <main className="app-shell">
      <header className="page-heading">
        <h1>Gestión de usuarios</h1>
        <p className="subtitle">Administra las cuentas de los operadores.</p>
        <div className="gold-line" />
      </header>

      <section className="panel">
        <div className="operator-toolbar">
          <p className="total-count">
            Operadores: <strong>{operadores.length}</strong>
          </p>
          {!showForm && (
            <button
              className="primary-button"
              type="button"
              onClick={openCreateForm}
            >
              Nuevo operador
            </button>
          )}
        </div>

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

        {showForm && (
          <form className="operator-form" onSubmit={handleSubmit}>
            <h2>{editingOperator ? "Editar operador" : "Crear operador"}</h2>
            <label htmlFor="operator-email">Correo electrónico</label>
            <input
              id="operator-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              disabled={isSaving}
            />
            <label htmlFor="operator-password">
              {editingOperator
                ? "Nueva contraseña (opcional)"
                : "Contraseña"}
            </label>
            <input
              id="operator-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required={!editingOperator}
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              disabled={isSaving}
            />
            <p className="field-hint">
              {editingOperator
                ? "Déjala vacía para conservar la contraseña actual."
                : "Usa una contraseña de al menos 12 caracteres."}
            </p>
            <div className="operator-form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? "Guardando..."
                  : editingOperator
                    ? "Guardar cambios"
                    : "Crear operador"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={closeForm}
                disabled={isSaving}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="loading-message" role="status">
            Cargando operadores...
          </p>
        ) : (
          <div className="table-scroll">
            <table className="attendees-table">
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Creación</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {operadores.map((operator) => (
                  <tr key={operator.id}>
                    <td>{operator.email}</td>
                    <td>
                      <span
                        className={
                          operator.activo
                            ? "status-badge status-used"
                            : "status-badge"
                        }
                      >
                        {operator.activo ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td>{formatDate(operator.createdAt)}</td>
                    <td>
                      <div className="operator-row-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openEditForm(operator)}
                          disabled={Boolean(busyId)}
                          aria-label={`Editar ${operator.email}`}
                        >
                          Editar
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => handleToggleActive(operator)}
                          disabled={busyId === operator.id}
                          aria-label={`${operator.activo ? "Desactivar" : "Activar"} ${operator.email}`}
                        >
                          {busyId === operator.id
                            ? "Actualizando..."
                            : operator.activo
                              ? "Desactivar"
                              : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {operadores.length === 0 && (
                  <tr>
                    <td colSpan="4" className="empty-row">
                      No hay operadores registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint operator-security-note">
          Las cuentas se desactivan de forma lógica para conservar su historial.
        </p>
      </section>
    </main>
  );
}

export default Usuarios;
