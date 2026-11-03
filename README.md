# UNO Online

Multiplayer UNO in the browser. No signup: create a room, share the code, and friends join with a name that is unique in that room.

## Features

- Rooms with 5-character codes and shareable invite links
- Full standard UNO: number, Skip, Reverse, Draw Two, Wild, Wild Draw Four
- UNO call and catch penalty, draw-then-play rule, Wild Draw Four challenge
- Optional house rules set by the host: stacking Draw Two, challenge toggle, play-to score
- Multi-round scoring to a target score
- Sound effects for plays, draws, UNO, catches, challenges and wins; mute button bottom-left
- Reconnects after a page refresh; the server plays for players who drop out
- Server-authoritative rules, so no client can cheat

## Stack

- **Bun** for runtime, package management, tests and bundling
- **Elysia** server with REST and native WebSocket
- **React 19 + Vite + Tailwind CSS v4** client
- TypeScript throughout; the rules engine lives in `shared/` and is unit-tested

## Run it

Requires [Bun](https://bun.sh) 1.2 or newer.

```bash
bun install
bun run dev        # API server on http://localhost:3001, client on http://localhost:3000
bun run start      # production: build the client and serve everything on http://localhost:3000
```

Open http://localhost:3000 in two browser windows (or one normal and one private window). Create a room in one,
join with the code in the other.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `bun run dev`       | Start the server and Vite dev server together   |
| `bun test`          | Run engine, randomized and server tests         |
| `bun run typecheck` | Type-check every workspace                      |
| `bun run build`     | Build the client into `client/dist`             |

### Deploying (one server)

`bun run start` builds the client and serves it from the Elysia server on one port (3000 by default; set `PORT` to change it).
The API and WebSocket live on the same origin, so no CORS setup is needed. Client-side routes fall back to `index.html`.

```bash
PORT=8080 bun run start
```

Hosting the client on another origin is also supported: point `VITE_SERVER_URL` at the API in `client/.env` and list that
origin in `CORS_ORIGINS` on the server (default `http://localhost:3000,http://127.0.0.1:3000`).

```bash
# server
CORS_ORIGINS="https://uno.example.com" PORT=3001 bun --filter @uno/server start
# client (client/.env, before building)
VITE_SERVER_URL=https://api.uno.example.com
```

## Project layout

See [AGENTS.md](AGENTS.md) for the architecture, protocol and contribution notes, and [PLAN.md](PLAN.md) for the design.

## Limitations

- Rooms live in memory; restarting the server ends all games.
- Card artwork is drawn with CSS and SVG, so there are no third-party image assets.
