import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { extname, resolve, sep } from "node:path";
import { startProdServer } from "../node_modules/vinext/dist/server/prod-server.js";

const projectRoot = process.cwd();
const publicPort = Number(process.env.LOCAL_PREVIEW_PORT || 3000);
const vinextPort = Number(process.env.LOCAL_PREVIEW_VINEXT_PORT || 3002);
const clientDir = resolve(projectRoot, "dist", "client");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

if (!existsSync(resolve(projectRoot, "dist", "server", "index.js"))) {
  console.error("Missing dist/server/index.js. Run vinext build first.");
  process.exit(1);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED ||= "0";
await startProdServer({ port: vinextPort, host: "127.0.0.1" });

function resolveClientFile(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]).replaceAll("/", sep);
  const candidate = resolve(clientDir, `.${decodedPath}`);
  if (candidate !== clientDir && !candidate.startsWith(`${clientDir}${sep}`)) {
    return null;
  }
  return candidate;
}

async function serveStatic(req, res) {
  if (!req.url) return false;
  const pathname = req.url.split("?")[0];
  if (!pathname.startsWith("/assets/") && !pathname.match(/\.(svg|jpg|jpeg|png|webp|ico|woff2?)$/i)) {
    return false;
  }

  const filePath = resolveClientFile(pathname);
  if (!filePath) return false;

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return false;
  }
  if (!fileStat.isFile()) return false;

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Content-Length": String(fileStat.size),
    "Cache-Control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
  return true;
}

function proxyToVinext(req, res) {
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: vinextPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${vinextPort}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Local Vinext server is not ready yet. Refresh in a moment.");
  });

  req.pipe(proxyReq);
}

const server = createServer(async (req, res) => {
  if (await serveStatic(req, res)) return;
  proxyToVinext(req, res);
});

server.listen(publicPort, "0.0.0.0", () => {
  console.log(`Local preview running at http://127.0.0.1:${publicPort}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
