/** Local HTTPS browser boundary, forwarding to the real synthetic Shop fixture. */
import { createServer } from "node:https";
import http from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer as viteServer } from "vite";
import { boundary } from "./boundary.mjs";
const root = resolve(
  process.env.TG1_API_ROOT || "../miniapp-biotact/packages/api",
);
mkdirSync(".cache/tg1-browser", { recursive: true });
const cert = ".cache/tg1-browser/cert.pem",
  key = ".cache/tg1-browser/key.pem";
const generated = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "2",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost",
  ],
  { stdio: "ignore" },
);
if (generated.status !== 0)
  throw new Error("Synthetic certificate generation failed");
const python =
  process.env.TG1_PYTHON || resolve(root, "../../.venv/tg1/bin/python");
const fixture = process.env.TG1_BROWSER_BOUNDARY === "1";
const child = fixture
  ? null
  : spawn(
      python,
      [
        resolve(
          root,
          process.env.CONSULTANT_BROWSER_FIXTURE === "1"
            ? "tests/consultant_browser_server.py"
            : "tests/tg1_browser_server.py",
        ),
      ],
      {
        cwd: root,
        // The ingress owns native teardown; Playwright must not SIGTERM its group.
        detached: true,
        env: {
          ...process.env,
          TG1_BROWSER_DATABASE_URL:
            process.env.TG1_BROWSER_DATABASE_URL ||
            "postgresql://tg1:tg1_synthetic@127.0.0.1:55462/postgres",
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
const vite = await viteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
let nextHold = false,
  held = null;
const server = createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  (req, res) => {
    const url = new URL(req.url || "/", "https://localhost:4173");
    if (url.pathname === "/__test/hold") {
      nextHold =
        url.searchParams.get("kind") === "create" ? "requests" : "complete";
      res.end("ok");
      return;
    }
    if (url.pathname === "/__test/held") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ held: held !== null }));
      return;
    }
    if (url.pathname === "/__test/drop") {
      if (held) {
        held.drop();
        held = null;
      }
      res.end("ok");
      return;
    }
    if (url.pathname === "/__test/release") {
      if (held) {
        const old = held;
        held = null;
        old();
      }
      res.end("ok");
      return;
    }
    if (url.pathname === "/__test/ready" && fixture) {
      res.end("ready");
      return;
    }
    if (url.pathname === "/__test/ready") {
      const upstream = http.get(
        "http://127.0.0.1:8089/api/v1/buyer/auth/session",
        (r) => {
          res.statusCode =
            r.statusCode === 401 ||
            (process.env.CONSULTANT_BROWSER_FIXTURE === "1" &&
              [404, 503].includes(r.statusCode))
              ? 200
              : 503;
          r.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.statusCode = 503;
        res.end("not ready");
      });
      return;
    }
    if (
      url.pathname.startsWith("/api/") ||
      (process.env.CONSULTANT_BROWSER_FIXTURE === "1" &&
        url.pathname === "/__fixture/change")
    ) {
      const hold = nextHold && url.pathname.endsWith("/telegram/" + nextHold);
      if (hold) nextHold = false;
      if (fixture) {
        if (hold) {
          const writeHead = res.writeHead.bind(res),
            end = res.end.bind(res);
          res.writeHead = (...args) => {
            res._tg1Headers = args;
            return res;
          };
          res.end = (...args) => {
            held = () => {
              res.writeHead = writeHead;
              res.end = end;
              if (res._tg1Headers) writeHead(...res._tg1Headers);
              end(...args);
            };
            held.drop = () => {
              res.writeHead = writeHead;
              res.end = end;
              writeHead(503, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              });
              end('{"error":"authentication_unavailable"}');
            };
            return res;
          };
        }
        void boundary(req, res);
        return;
      }
      const upstream = http.request(
        {
          host: "127.0.0.1",
          port: 8089,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:4173" },
        },
        (r) => {
          if (!hold) {
            res.writeHead(r.statusCode || 503, r.headers);
            r.pipe(res);
            return;
          }
          const chunks = [];
          r.on("data", (x) => chunks.push(x));
          r.on("end", () => {
            held = () => {
              res.writeHead(r.statusCode || 503, r.headers);
              res.end(Buffer.concat(chunks));
            };
            held.drop = () => {
              res.writeHead(503, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              });
              res.end('{"error":"authentication_unavailable"}');
            };
          });
        },
      );
      upstream.on("error", () => {
        res.statusCode = 503;
        res.end('{"error":"authentication_unavailable"}');
      });
      req.pipe(upstream);
      return;
    }
    vite.middlewares(req, res);
  },
);
server.listen(4173, "::1");
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  if (held) {
    held();
    held = null;
  }
  const stopped =
    child && child.exitCode === null && child.signalCode === null
      ? new Promise((resolve) => {
          child.once("exit", resolve);
          // Uvicorn replays its signal. SIGINT raises through the fixture's finally;
          // the default SIGTERM would terminate it before disposable DB cleanup.
          child.kill("SIGINT");
        })
      : Promise.resolve();
  await Promise.all([
    new Promise((resolve) => server.close(resolve)),
    vite.close(),
    stopped,
  ]);
};
process.on("SIGINT", () => {
  void close();
});
process.on("SIGTERM", () => {
  void close();
});
