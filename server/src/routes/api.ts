import os from "node:os";

import { Elysia, t } from "elysia";

import type { RoomManager } from "../rooms";
import { CreateRoomBody, JoinRoomBody } from "../schemas";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let u = -1;
	let val = bytes;
	do {
		val /= 1024;
		u++;
	} while (val >= 1024 && u < units.length - 1);
	return `${val.toFixed(1)} ${units[u]}`;
}

export function createApiRoutes(rooms: RoomManager) {
	const cpuCount = Math.max(1, os.cpus()?.length || 1);
	let prevCpu = process.cpuUsage();
	let prevTime = process.hrtime.bigint();

	return new Elysia({ prefix: "/api" })
		.get("/health", () => {
			const memory = process.memoryUsage();
			const currentCpu = process.cpuUsage(prevCpu);
			const currentTime = process.hrtime.bigint();
			const elapsedNs = Number(currentTime - prevTime);

			let cpuPercent = 0;
			if (elapsedNs > 0) {
				const elapsedMicros = elapsedNs / 1_000;
				const totalCpuMicros = currentCpu.user + currentCpu.system;
				cpuPercent = Math.min(
					100,
					Math.max(0, +((totalCpuMicros / (elapsedMicros * cpuCount)) * 100).toFixed(1)),
				);
			}

			// Update baseline for the next sample
			prevCpu = process.cpuUsage();
			prevTime = currentTime;

			const stats = rooms.getStats();

			return {
				ok: true,
				status: "ok",
				uptimeSeconds: Math.floor(process.uptime()),
				timestamp: new Date().toISOString(),
				memory: formatBytes(memory.rss),
				cpu: `${cpuPercent}%`,
				connections: {
					concurrentSockets: stats.connectedPlayers,
					totalPlayers: stats.totalPlayers,
				},
				rooms: {
					total: stats.totalRooms,
					active: stats.activeRooms,
				},
			};
		})
		.post("/rooms", ({ body }) => rooms.createRoom(body.name), {
			body: CreateRoomBody,
		})
		.get("/rooms/:code", ({ params }) => rooms.roomExists(params.code), {
			params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
		})
		.post("/rooms/:code/join", ({ params, body }) => rooms.joinRoom(params.code, body.name), {
			params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
			body: JoinRoomBody,
		});
}
