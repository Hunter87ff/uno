import {
	type ClientMessage,
	CloseCode,
	type RoomView,
	type ServerMessage,
	ServerMessageType,
	type Session,
} from "@uno/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { WS_URL } from "./config";

export interface RoomSocketHandlers {
	/** The session is no longer valid (expired, removed from room, room deleted). */
	onInvalid: (reason: string) => void;
	/** The server rejected an action or sent a notice. */
	onError: (message: string) => void;
}

/**
 * Keeps a WebSocket open for `session`, applies every room snapshot the server pushes, and
 * reconnects with backoff when the connection drops.
 */
export function useRoomSocket(session: Session | null, handlers: RoomSocketHandlers) {
	const [room, setRoom] = useState<RoomView | null>(null);
	const [connected, setConnected] = useState(false);
	const socketRef = useRef<WebSocket | null>(null);

	// Keep the latest handlers without re-opening the socket when callers re-render.
	const handlersRef = useRef(handlers);
	useEffect(() => {
		handlersRef.current = handlers;
	});

	useEffect(() => {
		setRoom(null);
		if (!session) return;

		let disposed = false;
		let attempt = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const open = () => {
			const url =
				`${WS_URL}/ws?room=${encodeURIComponent(session.code)}` +
				`&token=${encodeURIComponent(session.token)}`;
			const ws = new WebSocket(url);
			socketRef.current = ws;

			ws.onopen = () => {
				attempt = 0;
				setConnected(true);
			};

			ws.onmessage = (event) => {
				let msg: ServerMessage;
				try {
					msg = JSON.parse(String(event.data)) as ServerMessage;
				} catch {
					return;
				}
				if (msg.type === ServerMessageType.Room) setRoom(msg.room);
				else handlersRef.current.onError(msg.message);
			};

			ws.onclose = (event) => {
				setConnected(false);
				if (disposed) return;
				if (event.code === CloseCode.InvalidSession || event.code === CloseCode.Removed) {
					handlersRef.current.onInvalid(event.reason || "You are no longer in this room");
					return;
				}
				const delay = Math.min(8000, 500 * 2 ** attempt);
				attempt += 1;
				timer = setTimeout(open, delay);
			};
		};

		open();

		return () => {
			disposed = true;
			clearTimeout(timer);
			socketRef.current?.close();
			socketRef.current = null;
		};
	}, [session]);

	const send = useCallback((message: ClientMessage) => {
		const ws = socketRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		} else {
			handlersRef.current.onError("Not connected to the server yet");
		}
	}, []);

	return { room, connected, send };
}
