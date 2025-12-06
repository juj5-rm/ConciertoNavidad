import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Función para validar si un niño es menor de 7 años
function esMenorDe7(fechaNacimiento) {
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();

  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }

  return edad < 7;
}

async function obtenerPrimerNumeroLibre(client) {
  const result = await client.query(`
    SELECT numero_boleta FROM asistentes
    WHERE numero_boleta IS NOT NULL
    ORDER BY numero_boleta ASC
  `);

  const usados = result.rows.map((r) => r.numero_boleta);

  // Buscar el primer número libre desde 1 hasta 225
  for (let i = 1; i <= 225; i++) {
    if (!usados.includes(i)) return i;
  }

  throw new Error("❌ No hay boletas disponibles");
}

// Crear un asistente individual
app.post("/api/asistentes", async (req, res) => {
  const { nombre, correo, identificacion, nacimiento, tipo } = req.body;
  const codigo_qr = uuidv4();
  const id = uuidv4();

  try {
    // Validaciones
    if (!tipo) return res.status(400).send("Debe indicar tipo (adulto o niño)");

    if (tipo === "adulto") {
      if (!nombre || !correo || !identificacion)
        return res
          .status(400)
          .send(
            "Nombre, correo e identificación son obligatorios para adultos"
          );
    }

    if (tipo === "niño") {
      if (!nombre || !nacimiento)
        return res
          .status(400)
          .send("Nombre y fecha de nacimiento obligatorios para niños");

      if (!esMenorDe7(nacimiento))
        return res.status(400).send("El niño debe ser menor de 7 años");
    }

    if (tipo === "niño") {
      if (correo || identificacion) {
        return res
          .status(400)
          .send("Los niños no deben tener correo ni identificación");
      }
    }

    const result = await pool.query(
      `INSERT INTO asistentes 
      (id, nombre, correo, identificacion, nacimiento, tipo, codigo_qr) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, nombre, correo, identificacion, nacimiento, tipo, codigo_qr]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al registrar asistente");
  }
});

async function obtenerSiguienteNumeroBoleta(client) {
  const result = await client.query(`
    SELECT MAX(numero_boleta) AS max FROM asistentes;
  `);

  let siguiente = (result.rows[0].max || 0) + 1;

  if (siguiente > 225) {
    throw new Error("❌ Se alcanzó el límite máximo de 225 boletas");
  }

  return siguiente;
}

// Registrar grupo
app.post("/api/asistentes/grupo", async (req, res) => {
  const { grupo } = req.body;

  if (!Array.isArray(grupo) || grupo.length === 0)
    return res.status(400).json({ error: "Debe enviar un grupo válido" });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const idLider = uuidv4();
    const codigoLider = uuidv4();
    const qrsGenerados = [];

    // ⭐ Obtener siguiente número de boleta
    let numeroBoleta = await obtenerPrimerNumeroLibre(client);

    const lider = grupo[0];

    const resultLider = await client.query(
      `INSERT INTO asistentes 
      (id, nombre, correo, identificacion, tipo, codigo_qr, id_grupo, numero_boleta)
      VALUES ($1,$2,$3,$4,'adulto',$5,NULL,$6)
      RETURNING *`,
      [
        idLider,
        lider.nombre,
        lider.correo,
        lider.identificacion,
        codigoLider,
        numeroBoleta,
      ]
    );

    qrsGenerados.push({
      qr: codigoLider,
      nombre: lider.nombre,
      numero_boleta: numeroBoleta,
      identificacion: lider.identificacion,
    });

    // Aumentar boleta para el siguiente integrante
    numeroBoleta = await obtenerPrimerNumeroLibre(client);

    // Insertar miembros
    for (let i = 1; i < grupo.length; i++) {
      const p = grupo[i];
      const idMiembro = uuidv4();
      const codigo = uuidv4();

      if (numeroBoleta > 225)
        throw new Error("❌ Se alcanzó el límite máximo de 225 boletas");

      if (p.tipo === "niño") {
        await client.query(
          `INSERT INTO asistentes 
          (id, nombre, nacimiento, tipo, codigo_qr, id_grupo, numero_boleta)
          VALUES ($1,$2,$3,'niño',$4,$5,$6)`,
          [idMiembro, p.nombre, p.nacimiento, codigo, idLider, numeroBoleta]
        );
      } else {
        await client.query(
          `INSERT INTO asistentes 
          (id, nombre, correo, identificacion, tipo, codigo_qr, id_grupo, numero_boleta)
          VALUES ($1,$2,$3,$4,'adulto',$5,$6,$7)`,
          [
            idMiembro,
            p.nombre,
            p.correo,
            p.identificacion,
            codigo,
            idLider,
            numeroBoleta,
          ]
        );
      }

      qrsGenerados.push({
        qr: codigo,
        nombre: p.nombre,
        numero_boleta: numeroBoleta,
        identificacion: p.identificacion || null,
      });

      numeroBoleta++;
    }

    await client.query("COMMIT");
    res.json({ qrs: qrsGenerados });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).send(err.message);
  } finally {
    client.release();
  }
});

// Buscar por documento y retornar grupo si aplica
app.get("/api/asistentes/documento/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar asistente por documento
    const busqueda = await pool.query(
      "SELECT * FROM asistentes WHERE identificacion = $1",
      [id]
    );

    if (busqueda.rows.length === 0)
      return res.status(404).send("Documento no encontrado");

    const asistente = busqueda.rows[0];

    let lider;
    let grupo;

    // 🔹 Si el asistente es el líder
    if (asistente.id_grupo === null) {
      lider = asistente;

      grupo = await pool.query("SELECT * FROM asistentes WHERE id_grupo = $1", [
        asistente.id,
      ]);
    } else {
      // 🔹 Si es miembro
      const liderResult = await pool.query(
        "SELECT * FROM asistentes WHERE id = $1",
        [asistente.id_grupo]
      );

      lider = liderResult.rows[0];

      grupo = await pool.query("SELECT * FROM asistentes WHERE id_grupo = $1", [
        asistente.id_grupo,
      ]);
    }

    // ⭐ Unificar líder + grupo en una sola estructura
    const todos = [lider, ...grupo.rows];

    // ⭐ Formato de boletas para el frontend
    const boletas = todos.map((p) => ({
      nombre: p.nombre,
      qr: p.codigo_qr,
      numero_boleta: p.numero_boleta,
    }));

    return res.json({
      lider,
      grupo: grupo.rows,
      boletas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en la búsqueda");
  }
});

// Obtener todos
app.get("/api/asistentes", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM asistentes
      ORDER BY 
        COALESCE(id_grupo, id) ASC,   -- agrupa por líder
        numero_boleta ASC             -- ordena dentro del grupo
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al obtener asistentes");
  }
});

// Validar QR (igual que antes)
app.post("/api/validar", async (req, res) => {
  const { codigo_qr } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM asistentes WHERE codigo_qr = $1",
      [codigo_qr]
    );

    if (result.rows.length === 0)
      return res.status(404).send("QR no encontrado");

    const asistente = result.rows[0];

    if (asistente.validado)
      return res.status(400).send("Entrada ya registrada");

    await pool.query(
      "UPDATE asistentes SET validado = true WHERE codigo_qr = $1",
      [codigo_qr]
    );

    res.json({
      message: "Entrada validada con éxito",
      asistente,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al validar QR");
  }
});

app.put("/api/asistentes/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, correo, identificacion, nacimiento } = req.body;

  try {
    // Obtener datos actuales
    const result = await pool.query("SELECT * FROM asistentes WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0)
      return res.status(404).send("Asistente no encontrado");

    const asistente = result.rows[0];

    // Validaciones según tipo
    if (asistente.tipo === "adulto") {
      if (!nombre || !correo || !identificacion)
        return res
          .status(400)
          .send(
            "Nombre, correo e identificación son obligatorios para adultos"
          );

      if (nacimiento)
        return res
          .status(400)
          .send("Los adultos no pueden tener fecha de nacimiento registrada");
    }

    if (asistente.tipo === "niño") {
      if (!nombre)
        return res.status(400).send("El nombre es obligatorio para niños");

      if (!nacimiento)
        return res
          .status(400)
          .send("La fecha de nacimiento es obligatoria para niños");

      if (!esMenorDe7(nacimiento))
        return res.status(400).send("El niño debe ser menor de 7 años");
    }

    const updated = await pool.query(
      `UPDATE asistentes SET 
        nombre=$1,
        correo=$2,
        identificacion=$3,
        nacimiento=$4
      WHERE id=$5
      RETURNING *`,
      [
        nombre || null,
        correo || null,
        identificacion || null,
        nacimiento || null,
        id,
      ]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al editar asistente");
  }
});

app.put("/api/asistentes/grupo/:id_lider", async (req, res) => {
  const { id_lider } = req.params;
  const { lider, miembros } = req.body;

  try {
    // Verificar que existe un líder real
    const r = await pool.query(
      "SELECT * FROM asistentes WHERE id = $1 AND id_grupo IS NULL",
      [id_lider]
    );

    if (r.rows.length === 0)
      return res.status(404).send("Líder no encontrado o no es líder de grupo");

    // Validar líder
    if (!lider.nombre || !lider.correo || !lider.identificacion)
      return res
        .status(400)
        .send("El líder debe tener nombre, correo e identificación");

    // Actualizar líder
    await pool.query(
      `UPDATE asistentes SET 
        nombre=$1,
        correo=$2,
        identificacion=$3
      WHERE id=$4`,
      [lider.nombre, lider.correo, lider.identificacion, id_lider]
    );

    // Recorrer the miembros y actualizarlos
    for (const m of miembros) {
      const miembroActual = await pool.query(
        "SELECT * FROM asistentes WHERE id=$1 AND id_grupo=$2",
        [m.id, id_lider]
      );

      if (miembroActual.rows.length === 0)
        return res.status(400).send("Miembro no pertenece a este grupo");

      const tipo = miembroActual.rows[0].tipo;

      // Validaciones según tipo
      if (tipo === "adulto") {
        if (!m.nombre || !m.correo || !m.identificacion)
          return res
            .status(400)
            .send("Los adultos requieren nombre, correo e identificación");

        if (m.nacimiento)
          return res
            .status(400)
            .send("Los adultos no deben tener fecha de nacimiento");
      }

      if (tipo === "niño") {
        if (!m.nombre || !m.nacimiento)
          return res
            .status(400)
            .send("Los niños requieren nombre y fecha de nacimiento");

        if (!esMenorDe7(m.nacimiento))
          return res.status(400).send("Un niño debe ser menor de 7 años");
      }

      // Actualizar miembro
      await pool.query(
        `UPDATE asistentes SET 
          nombre=$1,
          correo=$2,
          identificacion=$3,
          nacimiento=$4
        WHERE id=$5`,
        [
          m.nombre || null,
          m.correo || null,
          m.identificacion || null,
          m.nacimiento || null,
          m.id,
        ]
      );
    }

    res.json({ mensaje: "Grupo actualizado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al editar grupo");
  }
});

app.post("/api/reservar", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { cantidad } = req.body;
    const expiracion = new Date(Date.now() + 5 * 60 * 1000);

    // Bloquea la tabla asistentes + holds para evitar carreras
    await client.query("LOCK TABLE asistentes IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE holds IN SHARE ROW EXCLUSIVE MODE");

    const result = await client.query(
      "SELECT cupos_disponibles() AS libres FOR UPDATE"
    );
    const libres = result.rows[0].libres;

    if (cantidad > libres) {
      await client.query("ROLLBACK");
      return res.status(400).send("No hay suficientes cupos disponibles");
    }

    const hold = await client.query(
      `INSERT INTO holds (cantidad, expiracion)
       VALUES ($1, $2)
       RETURNING *`,
      [cantidad, expiracion]
    );

    await client.query("COMMIT");

    res.json({
      mensaje: "Cupos reservados temporalmente",
      hold_id: hold.rows[0].id,
      expiracion,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).send("Error al generar reserva temporal");
  } finally {
    client.release();
  }
});

app.post("/api/reservar/confirmar", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { hold_id, grupo } = req.body;

    const result = await client.query(
      "SELECT * FROM holds WHERE id=$1 FOR UPDATE",
      [hold_id]
    );

    if (result.rows.length === 0)
      return res.status(404).send("Reserva temporal no existe");

    const h = result.rows[0];

    if (h.usado) return res.status(400).send("Esta reserva ya fue usada");

    if (new Date(h.expiracion) < new Date())
      return res.status(400).send("La reserva temporal expiró");

    if (grupo.length !== h.cantidad)
      return res.status(400).send("La cantidad no coincide con la reserva");

    // Insertar asistentes confirmados
    for (const p of grupo) {
      await client.query(
        `INSERT INTO asistentes
        (id, nombre, correo, identificacion, nacimiento, tipo, codigo_qr)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          uuidv4(),
          p.nombre,
          p.correo || null,
          p.identificacion || null,
          p.nacimiento || null,
          p.tipo,
          uuidv4(),
        ]
      );
    }

    // Marcar hold como usado
    await client.query("UPDATE holds SET usado=true WHERE id=$1", [hold_id]);

    await client.query("COMMIT");

    res.json({ mensaje: "Compra confirmada con éxito" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).send("Error al confirmar la reserva");
  } finally {
    client.release();
  }
});

cron.schedule("0 3 * * *", async () => {
  try {
    console.log("🧹 Limpiando holds expirados...");
    await pool.query(
      "DELETE FROM holds WHERE expiracion < NOW() AND usado = false"
    );
    console.log("✔ Limpieza completada");
  } catch (error) {
    console.error("Error limpiando holds:", error);
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${process.env.PORT}`)
);
