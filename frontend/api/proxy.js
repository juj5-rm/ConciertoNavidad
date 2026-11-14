const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "origin",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const MAX_BODY_BYTES = 1024 * 1024;

function getBackendBaseUrl() {
  const configuredUrl = process.env.NEST_API_URL;
  if (!configuredUrl) return null;

  let backend;
  try {
    backend = new URL(configuredUrl);
  } catch {
    return null;
  }

  if (
    backend.protocol !== "https:" ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  ) {
    return null;
  }

  return backend.origin;
}

async function readRequestBody(request) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds the allowed size.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

module.exports = async function proxy(request, response) {
  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    response.status(503).json({
      message: "El servicio de API no está configurado en Vercel.",
    });
    return;
  }

  const requestUrl = new URL(request.url, "https://vercel.invalid");
  const path = requestUrl.searchParams.get("path");
  if (!path || !/^[A-Za-z0-9/_-]+$/.test(path) || path.includes("..")) {
    response.status(400).json({ message: "La ruta solicitada no es válida." });
    return;
  }
  requestUrl.searchParams.delete("path");

  const backendUrl = new URL(path.replace(/^\/+/, ""), `${backendBaseUrl}/`);
  backendUrl.search = requestUrl.searchParams.toString();

  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      const normalizedName = name.toLowerCase();
      if (value && !HOP_BY_HOP_HEADERS.has(normalizedName)) {
        headers.set(normalizedName, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    const method = request.method || "GET";
    const body = ["GET", "HEAD"].includes(method)
      ? undefined
      : await readRequestBody(request);
    const upstream = await fetch(backendUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    response.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
        response.setHeader(name, value);
      }
    });
    const cookies = upstream.headers.getSetCookie?.();
    const setCookie = cookies?.length ? cookies : upstream.headers.get("set-cookie");
    if (setCookie) response.setHeader("set-cookie", setCookie);

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    response.end(responseBody);
  } catch (error) {
    response.status(error.statusCode || 502).json({
      message:
        error.statusCode === 413
          ? "El contenido de la solicitud supera el tamaño permitido."
          : "No fue posible conectar con el servicio de API.",
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
