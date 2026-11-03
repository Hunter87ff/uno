import { Elysia, t } from "elysia";
import {
    CLOSE_FORBIDDEN_ORIGIN,
    CLOSE_INVALID_SESSION,
    type ClientMessage,
    type ServerMessage,
} from "@uno/shared";
import { isOriginAllowed } from "../config";
import type { RoomManager, Sender } from "../rooms";
import { ClientMessageSchema } from "../schemas";

export function createWsRoutes(rooms: RoomManager) {
    /** Maps the raw Bun socket to the Sender the room manager uses, so `close` can find it again. */
    const senders = new WeakMap<object, Sender>();

    return new Elysia().ws("/ws", {
        query: t.Object({
            room: t.String({ minLength: 1, maxLength: 8 }),
            token: t.String({ minLength: 1, maxLength: 64 }),
        }),
        body: ClientMessageSchema,
        open(ws) {
            const { room, token } = ws.data.query;
            // CORS does not apply to WebSockets, so check the Origin header ourselves.
            const origin = ws.data.headers["origin"];
            if (!isOriginAllowed(origin, ws.data.headers["host"])) {
                ws.close(CLOSE_FORBIDDEN_ORIGIN, "Origin not allowed");
                return;
            }
            const sender: Sender = {
                send: (message: ServerMessage) => ws.send(message),
                close: (code: number, reason: string) => ws.close(code, reason),
            };
            senders.set(ws.raw as object, sender);
            try {
                rooms.attach(room, token, sender);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : "Could not connect";
                ws.send({ type: "error", message } satisfies ServerMessage);
                ws.close(CLOSE_INVALID_SESSION, message);
            }
        },
        message(ws, message) {
            const { room, token } = ws.data.query;
            const sender = senders.get(ws.raw as object);
            if (!sender) return;
            const playerId = rooms.playerIdFor(room, token);
            if (!playerId) return;
            rooms.handle(room.toUpperCase(), playerId, message as ClientMessage);
        },
        close(ws) {
            const { room, token } = ws.data.query;
            const sender = senders.get(ws.raw as object);
            if (sender) rooms.detach(room.toUpperCase(), token, sender);
        },
    });
}
