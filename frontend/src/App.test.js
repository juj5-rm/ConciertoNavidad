import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import api from "./api";

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    const RouterContext = React.createContext(null);

    function BrowserRouter({ children }) {
      const [pathname, setPathname] = React.useState(
        globalThis.window.location.pathname,
      );
      const navigate = React.useCallback((to, options = {}) => {
        const method = options.replace ? "replaceState" : "pushState";
        globalThis.window.history[method]({ usr: options.state }, "", to);
        setPathname(to);
      }, []);

      return (
        <RouterContext.Provider value={{ pathname, navigate }}>
          {children}
        </RouterContext.Provider>
      );
    }

    function useRouter() {
      const context = React.useContext(RouterContext);
      if (!context) throw new Error("Router is required in this test.");
      return context;
    }

    function Navigate({ to, replace, state }) {
      const { navigate } = useRouter();
      React.useEffect(
        () => navigate(to, { replace, state }),
        [navigate, replace, state, to],
      );
      return null;
    }

    function Routes({ children }) {
      const { pathname } = useRouter();
      const routes = React.Children.toArray(children);
      const match =
        routes.find((route) => route.props.path === pathname) ||
        routes.find((route) => route.props.path === "*");
      return match?.props.element || null;
    }

    function Link({ to, children, ...props }) {
      const { navigate } = useRouter();
      return (
        <a
          href={to}
          {...props}
          onClick={(event) => {
            event.preventDefault();
            props.onClick?.(event);
            navigate(to);
          }}
        >
          {children}
        </a>
      );
    }

    function NavLink({ to, children, ...props }) {
      const { pathname } = useRouter();
      return (
        <Link to={to} {...props} className={pathname === to ? "active" : ""}>
          {children}
        </Link>
      );
    }

    return {
      BrowserRouter,
      Link,
      Navigate,
      NavLink,
      Route: () => null,
      Routes,
      useLocation: () => {
        const { pathname } = useRouter();
        return { pathname, state: globalThis.window.history.state?.usr };
      },
      useNavigate: () => useRouter().navigate,
    };
  },
  { virtual: true },
);

jest.mock("./api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  getApiErrorMessage: jest.fn(() => "No fue posible completar la solicitud."),
}));

jest.mock("./validacion", () => () => <div>Verificación QR</div>);

const admin = { id: "admin-1", email: "admin@example.com", rol: "ADMIN" };
const operator = {
  id: "operator-1",
  email: "operator@example.com",
  rol: "OPERADOR",
};

beforeEach(() => {
  jest.restoreAllMocks();
  window.history.pushState({}, "", "/");
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

test("permite iniciar sesión y restaura la navegación de acuerdo con el rol", async () => {
  window.history.pushState({}, "", "/login");
  api.get.mockRejectedValue({ response: { status: 401 } });
  api.post.mockResolvedValue({ data: { user: admin } });

  render(<App />);
  fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
    target: { value: "admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "example-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

  expect(await screen.findByText("Verificación QR")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/auth/login", {
    email: "admin@example.com",
    password: "example-password",
  });
  expect(screen.getByRole("link", { name: "Asistentes" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Capacidad" })).toBeInTheDocument();
});

test("restaura sesión de OPERADOR sin mostrar navegación administrativa", async () => {
  window.history.pushState({}, "", "/validar");
  api.get.mockResolvedValue({ data: { user: operator } });

  render(<App />);

  expect(await screen.findByText("Verificación QR")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Asistentes" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Capacidad" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Gestión de usuarios" }),
  ).not.toBeInTheDocument();
});

test("restringe la ruta de gestión de usuarios al ADMIN", async () => {
  window.history.pushState({}, "", "/usuarios");
  api.get.mockResolvedValue({ data: { user: operator } });

  render(<App />);

  expect(await screen.findByText("Verificación QR")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Gestión de usuarios" }),
  ).not.toBeInTheDocument();
});

test("permite al ADMIN gestionar operadores sin exponer contraseñas", async () => {
  window.history.pushState({}, "", "/usuarios");
  const firstOperator = {
    id: "operator-1",
    email: "operator@example.com",
    rol: "OPERADOR",
    activo: true,
    createdAt: "2026-11-14T12:00:00.000Z",
  };
  const newOperator = {
    id: "operator-2",
    email: "new@example.com",
    rol: "OPERADOR",
    activo: true,
    createdAt: "2026-11-14T12:00:00.000Z",
  };
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data:
        path === "/auth/me"
          ? { user: admin }
          : { operadores: [firstOperator] },
    }),
  );
  api.post.mockResolvedValue({ data: { operador: newOperator } });
  api.patch
    .mockResolvedValueOnce({
      data: { operador: { ...newOperator, email: "updated@example.com" } },
    })
    .mockResolvedValueOnce({
      data: { operador: { ...newOperator, email: "updated@example.com", activo: false } },
    })
    .mockResolvedValueOnce({
      data: { operador: { ...newOperator, email: "updated@example.com", activo: true } },
    });
  jest.spyOn(window, "confirm").mockReturnValue(true);

  render(<App />);

  expect(
    await screen.findByRole("heading", { name: "Gestión de usuarios" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("operator@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nuevo operador" }));
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "a-secure-operator-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Crear operador" }));

  expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith("/usuarios/operadores", {
    email: "new@example.com",
    password: "a-secure-operator-password",
  });
  fireEvent.click(screen.getByRole("button", { name: "Editar new@example.com" }));
  expect(screen.getByLabelText("Nueva contraseña (opcional)")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "updated@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText("updated@example.com")).toBeInTheDocument();
  expect(api.patch).toHaveBeenCalledWith("/usuarios/operadores/operator-2", {
    email: "updated@example.com",
  });

  fireEvent.click(
    screen.getByRole("button", { name: "Desactivar updated@example.com" }),
  );
  expect(await screen.findByText("Desactivado")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Activar updated@example.com" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Desactivar updated@example.com",
    }),
  ).toBeInTheDocument();
  expect(JSON.stringify(api.post.mock.calls)).not.toContain("passwordHash");
});

test("muestra el listado con el contrato mínimo de NestJS", async () => {
  window.history.pushState({}, "", "/asistentes");
  api.get.mockImplementation((path) => {
    if (path === "/auth/me") return Promise.resolve({ data: { user: admin } });
    return Promise.resolve({
      data: {
        asistentes: [
          {
            numeroBoleta: 12,
            nombre: "Ana Ejemplo",
            tipo: "ADULTO",
            validado: true,
            validadoAt: "2025-12-20T19:00:00.000Z",
          },
        ],
        total: 1,
      },
    });
  });

  render(<App />);

  expect(await screen.findByText("Ana Ejemplo")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByText("ADULTO")).toBeInTheDocument();
  expect(screen.getByText("Validada")).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/asistentes"));
});

test("inicializa la capacidad desde el backend y envía el valor editado", async () => {
  window.history.pushState({}, "", "/capacidad");
  const initialSnapshot = {
    capacidadMaxima: 80,
    asistentesRegistrados: 32,
    reservasVigentes: 8,
    ocupacionTotal: 40,
    disponibles: 40,
  };
  const updatedSnapshot = {
    ...initialSnapshot,
    capacidadMaxima: 90,
    disponibles: 50,
  };
  api.get.mockImplementation((path) =>
    Promise.resolve({
      data: path === "/auth/me" ? { user: admin } : initialSnapshot,
    }),
  );
  api.patch.mockResolvedValue({ data: updatedSnapshot });

  render(<App />);

  const capacityInput = await screen.findByLabelText("Nueva capacidad máxima");
  expect(capacityInput).toHaveValue(80);
  fireEvent.change(capacityInput, { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Actualizar capacidad" }));

  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith("/capacidad", {
      capacidadMaxima: 90,
    }),
  );
  expect(
    await screen.findByText("La capacidad se actualizó correctamente."),
  ).toBeInTheDocument();
  expect(screen.getByText("50")).toBeInTheDocument();
});

test("permite una inscripción pública grupal con consentimiento y muestra todas las boletas", async () => {
  api.get.mockRejectedValue({ response: { status: 401 } });
  api.post.mockResolvedValue({
    data: {
      asistentes: [
        {
          nombre: "Ana Ejemplo",
          tipo: "ADULTO",
          codigoQr: "adult-qr",
          numeroBoleta: 101,
        },
        {
          nombre: "Mario Ejemplo",
          tipo: "ADULTO",
          codigoQr: "second-adult-qr",
          numeroBoleta: 102,
        },
        {
          nombre: "Luis Ejemplo",
          tipo: "NINO",
          codigoQr: "child-qr",
          numeroBoleta: 103,
        },
      ],
    },
  });

  render(<App />);

  fireEvent.change(await screen.findByLabelText("Nombre completo"), {
    target: { value: "Ana Ejemplo" },
  });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "ana@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Identificación"), {
    target: { value: "ID-101" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar adulto" }));
  const adultNames = screen.getAllByLabelText("Nombre completo");
  fireEvent.change(adultNames[1], { target: { value: "Mario Ejemplo" } });
  fireEvent.change(screen.getAllByLabelText("Correo electrónico")[1], {
    target: { value: "mario@example.com" },
  });
  fireEvent.change(screen.getAllByLabelText("Identificación")[1], {
    target: { value: "ID-102" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Agregar niño" }));
  const names = screen.getAllByLabelText("Nombre completo");
  fireEvent.change(names[2], { target: { value: "Luis Ejemplo" } });
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), {
    target: { value: "2020-01-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Revisar inscripción" }));

  expect(await screen.findByText(/Revisa tu grupo/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar inscripción" }),
  );

  expect(await screen.findByText("Inscripción confirmada")).toBeInTheDocument();
  expect(screen.getByText("Boleta 101")).toBeInTheDocument();
  expect(screen.getByText("Boleta 102")).toBeInTheDocument();
  expect(screen.getByText("Boleta 103")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Código QR de la boleta 101"),
  ).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith(
    "/grupos/inscripcion",
    expect.objectContaining({
      adultos: [
        {
          nombre: "Ana Ejemplo",
          correo: "ana@example.com",
          identificacion: "ID-101",
        },
        {
          nombre: "Mario Ejemplo",
          correo: "mario@example.com",
          identificacion: "ID-102",
        },
      ],
      ninos: [{ nombre: "Luis Ejemplo", nacimiento: "2020-01-01" }],
      consentimientoAceptado: true,
      consentimientoVersion: "2026-11-13-v1",
    }),
  );
});
