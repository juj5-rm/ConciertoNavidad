import pkg from "pg";
const { Pool } = pkg;

import dotenv from "dotenv";
dotenv.config();

let pool;

// Si existe DATABASE_URL → estamos en Render
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    max: 20,
  });
} else {
  // Modo local
  pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: Number(process.env.PGPORT),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    max: 20,
  });
}

pool.on("error", (err) => {
  console.error("❌ PG Pool Error:", err.message);
});

export { pool };
