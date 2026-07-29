import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env.local")) {
  try {
    loadEnvFile(".env.local");
  } catch {
    console.error("No fue posible leer .env.local. Revisa su formato.");
    process.exit(1);
  }
}

const required = [
  {
    name: "DATABASE_URL",
    alternatives: ["POSTGRES_URL", "NEON_DATABASE_URL"],
    purpose: "guardar catalogos, ventas, inventario, facturas, cartera y reportes",
  },
  {
    name: "BLOB_READ_WRITE_TOKEN",
    alternatives: ["BLOB_STORE_ID"],
    purpose: "guardar y consultar archivos adjuntos",
  },
  {
    name: "SESSION_SECRET",
    alternatives: [],
    purpose: "firmar sesiones de usuarios",
  },
];

const strict = process.argv.includes("--strict");
const missing = required.filter((item) => ![item.name, ...item.alternatives].some((name) => Boolean(process.env[name])));

if (!missing.length) {
  console.log("OK: variables operativas principales configuradas.");
  process.exit(0);
}

console.log("Variables pendientes de revisar:");
missing.forEach((item) => {
  const names = [item.name, ...item.alternatives].join(" o ");
  console.log(`- ${names}: requerido para ${item.purpose}.`);
});

if (strict) process.exit(1);
console.log("Aviso: ejecuta con --strict para fallar cuando falten variables.");
