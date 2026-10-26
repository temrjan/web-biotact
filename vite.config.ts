import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Local public-read transport only; never installed in dev or a browser build. */
function publicCataloguePreview(): Plugin {
  return {
    name: "local-public-catalogue-preview",
    configResolved(config) {
      if (config.preview.host !== "127.0.0.1")
        throw new Error("Public catalogue preview requires --host 127.0.0.1");
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const target = req.url || "/";
        const separator = target.indexOf("?");
        const path = separator === -1 ? target : target.slice(0, separator);
        if (path !== "/api" && !path.startsWith("/api/")) return next();
        const fail = (status: number, error: string) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ error }));
        };
        if (
          req.method !== "GET" ||
          !/^\/api\/v1\/(categories|products|products\/[1-9]\d*)$/.test(path)
        ) {
          fail(403, "public_catalogue_preview_only");
          return;
        }
        const params = new URLSearchParams(
          separator === -1 ? "" : target.slice(separator + 1),
        );
        const allowed =
          path === "/api/v1/categories"
            ? ["page", "size"]
            : path === "/api/v1/products"
              ? ["page", "size", "category_id", "search"]
              : [];
        const language = req.headers["x-language"] ?? "ru";
        if (
          [...params.keys()].some((key) => !allowed.includes(key)) ||
          (language !== "ru" && language !== "uz")
        ) {
          fail(400, "unsupported_public_catalogue_parameters");
          return;
        }
        const controller = new AbortController();
        res.once("close", () => controller.abort());
        try {
          const upstream = await fetch(
            `https://app.biotact.uz${path}?${params}`,
            {
              method: "GET",
              headers: { Accept: "application/json", "X-Language": language },
              credentials: "omit",
              redirect: "error",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(10000),
              ]),
            },
          );
          if (
            (upstream.status >= 300 && upstream.status < 400) ||
            !upstream.headers.get("content-type")?.includes("application/json")
          ) {
            await upstream.body?.cancel();
            fail(502, "public_catalogue_upstream_unavailable");
            return;
          }
          const body = Buffer.from(await upstream.arrayBuffer());
          if (res.destroyed) return;
          res.writeHead(upstream.status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(body);
        } catch {
          if (!res.destroyed)
            fail(502, "public_catalogue_upstream_unavailable");
        }
      });
    },
  };
}

export default defineConfig(({ isPreview }) => {
  const publicPreview =
    isPreview && process.env.BIOTACT_PUBLIC_CATALOGUE_PREVIEW === "1";
  return {
    plugins: [react(), ...(publicPreview ? [publicCataloguePreview()] : [])],
    build: { target: "es2022" },
    ...(publicPreview ? { preview: { host: "127.0.0.1", cors: false } } : {}),
  };
});
