import { Elysia, t } from "elysia";
import type { RoomManager } from "../rooms";
import { CreateRoomBody, JoinRoomBody } from "../schemas";

export function createApiRoutes(rooms: RoomManager) {
  return new Elysia({ prefix: "/api" })
    .get("/health", () => ({ ok: true }))
    .post("/rooms", ({ body }) => rooms.createRoom(body.name), {
      body: CreateRoomBody,
    })
    .get("/rooms/:code", ({ params }) => rooms.roomExists(params.code), {
      params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
    })
    .post(
      "/rooms/:code/join",
      ({ params, body }) => rooms.joinRoom(params.code, body.name),
      {
        params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
        body: JoinRoomBody,
      },
    );
}
