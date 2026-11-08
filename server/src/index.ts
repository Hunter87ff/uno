import { existsSync } from "node:fs";

import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { config, isOriginAllowed } from "./config";
import { RoomError, RoomManager, type Sender } from "./rooms";
import { createApiRoutes } from "./routes/api";
import { createWsRoutes } from "./routes/ws";
import { serveClient } from "./static";

export { config, isOriginAllowed, RoomError, RoomManager, type Sender };

export function createApp(roomManager: RoomManager = new RoomManager()) {
	return (
		new Elysia()
			.use(
				cors({
					origin: config.allowedOrigins,
					methods: ["GET", "POST", "OPTIONS"],
					allowedHeaders: ["content-type"],
				}),
			)
			.onError(({ code, error, set }) => {
				if (error instanceof RoomError) {
					set.status = error.status;
					return { message: error.message };
				}
				if (code === "VALIDATION" || code === "PARSE") {
					set.status = 400;
					return { message: "Invalid request" };
				}
				if (code === "NOT_FOUND") {
					set.status = 404;
					return { message: "Not found" };
				}
				console.error(error);
				set.status = 500;
				return { message: "Internal server error" };
			})
			.use(createApiRoutes(roomManager))
			.use(createWsRoutes(roomManager))
			// Bundled client: anything not matched above is a static file or the SPA entry point.
			.get("/*", ({ request }) => {
				const { pathname } = new URL(request.url);
				if (pathname.startsWith("/api/")) {
					return new Response(JSON.stringify({ message: "Not found" }), {
						status: 404,
						headers: { "content-type": "application/json" },
					});
				}
				return serveClient(pathname);
			})
	);
}

export const rooms = new RoomManager();
export const app = createApp(rooms);

if (import.meta.main) {
	// reusePort: false makes a second server on the same port fail loudly instead of silently
	// splitting requests between two in-memory room stores.
	app.listen({ port: config.port, reusePort: false });
	console.log(`UNO server listening on http://localhost:${config.port}`);
	console.log(
		`  API + WebSocket: /api, /ws   client: ${existsSync(config.clientDist) ? "bundled from client/dist" : "not built (bun run build)"}`,
	);
	console.log(`  CORS origins: ${config.allowedOrigins.join(", ")}`);
}

export type App = typeof app;
