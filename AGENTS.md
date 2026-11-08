# AGENTS.md

Guidance for AI agents (and humans) working on this repository. Read this first, then `PLAN.md`.
Keep the **Agent state** section at the bottom up to date whenever you finish or change something significant.

## What this is

A browser-based, multiplayer UNO game with no accounts. A player creates a room (gets a 5-character code),
others join by entering a name that is unique within that room. Standard UNO rules plus optional house rules.

## Hard constraints

- **Runtime is Bun, not Node.** Use `bun`, `bun install`, `bun add`, `bun test`, `bun x`. Do not add `npm`/`yarn`/`pnpm`
  lockfiles or scripts. Do not use `node` in scripts or docs.
- **Backend is Elysia** (REST + native WebSocket via `.ws()`). Do not add socket.io or a second server framework.
- **Frontend is React + Vite + Tailwind v4.** Only add a 3D library if a feature genuinely needs it (none does today).
- **Game rules live only in `shared/`.** The server is authoritative: the client never decides legality, it only
  renders snapshots and greys out cards listed in `round.playableIds`.
- **No external art assets.** Cards are drawn with CSS and inline SVG (`client/src/components/Card.tsx`). If you add
  images or fonts, make sure their license allows redistribution.
- **In-memory state only.** Rooms vanish on server restart. Don't add a database without a plan change.

## Layout

```
package.json          Bun workspace root (workspaces: shared, server, client)
tsconfig.base.json    Shared TS settings; each package extends it
shared/src/
  cards.ts            Card model, 108-card deck, shuffle, card points
  engine.ts           Rules: startRound, applyAction, suggestAction, viewFor, playError, roundPoints
  protocol.ts         WebSocket/REST message types, room view, close codes, limits
  engine.test.ts      Rule-level unit tests
  fuzz.test.ts        200 randomized full games checking invariants (card conservation etc.)
server/src/
  index.ts            Elysia app factory (`createApp`), default instance and startup entry point
  config/             Configuration module (ServerConfig, environment variable parsing, origin validation)
    index.ts
  rooms/              Room management module
    index.ts          Module exports
    room-manager.ts   RoomManager: state management, player lifecycle, game dispatch, auto-play, sweep
    types.ts          Room entities (PlayerRecord, Room, Sender, RoomError), validation, code generator
  routes/             Route modules
    api.ts            REST API route handlers (/api/health, /api/rooms)
    ws.ts             WebSocket connection handler, auth validation, socket lifecycle
  schemas.ts          Elysia (TypeBox) validators for requests and client WS messages
  server.test.ts      Integration tests (real server on a random port, real WebSocket clients, static serving, CORS)
  static.ts           Serves client/dist with SPA fallback and path-traversal protection
client/src/
  App.tsx             Routes between Home / Lobby / Game based on room status; owns session lifecycle
  useRoomSocket.ts    WebSocket hook: applies snapshots, reconnects with backoff, handles close codes
  api.ts              fetch wrappers for REST
  session.ts          sessionStorage (room/player/token) and localStorage (last used name)
  components/         Home, Lobby, Game (table, hand, overlays), Card (CSS/SVG art), ui (primitives)
  index.css           Tailwind import, backdrop, table and glass styles, small animations
  sound/              Synthesised sound effects: sfx.ts (Web Audio engine, mute state), events.ts (pure room-diff → sound
                      cues, tested), useGameSounds.ts (hook), SoundToggle.tsx. No audio files.
```

## Commands

```bash
bun install                  # once, from the repo root
bun run dev                  # API on :3001 and client on :3000 (client calls the API directly; CORS allows :3000)
bun run start                # production: build the client, then serve client + API on :3000 (PORT overrides)
bun test                     # all tests (shared + server)
bun run typecheck            # tsc in every workspace
bun run build                # production client build into client/dist
```

Run one package's tests: `bun test shared` or `bun test server`.

## Protocol contract (keep client and server in sync)

- REST: `POST /api/rooms {name}`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join {name}`.
  Responses are `Session {code, playerId, token}` or `{message}` on error (status codes matter: 404 unknown room,
  409 name taken / game running / full, 400 invalid input).
- Serving: the Elysia server serves `client/dist` (`server/src/static.ts`) with SPA fallback, so production runs on one
  origin and needs no CORS. In dev, the client (:3000) calls the API (:3001) directly; CORS allows `CORS_ORIGINS`.
  The WebSocket `Origin` is checked on upgrade: allowed if it is in `CORS_ORIGINS` or matches the server's own host;
  otherwise it is closed with **4404**.
- WebSocket: `GET /ws?room=CODE&token=TOKEN`. The token is the only credential. An invalid token closes with
  **4401**. A player removed from the lobby is closed with **4403**. Both codes are defined in `shared/src/protocol.ts`.
- Client to server: `{type:'settings'|'start'|'nextRound'|'resetRoom'|'kick'|'leave'|'action', ...}`. `start` carries
  `cardsPerPlayer`; `nextRound` reuses the last chosen count. Every new message type needs
  a matching entry in `shared/src/protocol.ts` **and** `server/src/schemas.ts`, or Elysia rejects it.
- Server to client: `{type:'room', room: RoomView}` after every change (per-viewer, opponents' hands hidden) or
  `{type:'error', message}` for a rejected action sent only to the sender.
- Engine actions: `play {cardId, color?, uno?}`, `draw`, `pass`, `catchUno {target}`, `callUno`.
  `callUno` (UNO button, ≤2 cards) bumps `unoCalls`, which clients use to play the recorded call in `client/src/sound/uno.wav` for everyone.

## Rules implemented (see PLAN.md for the full flow)

- 108-card deck. The host chooses cards per player (2–15, default 7; fewer when there are many players) and the server
  shuffles and deals to start the round. Starting card effects are applied (Wild Draw Four goes to the bottom).
- Players may draw a card on their turn even if they have playable cards. Once drawn, the player may play the drawn card or pass.
- Pending draws (Draw Two / Wild Draw Four) force the target to draw and lose their turn.
- UNO: `uno: true` on the play that leaves one card. Otherwise anyone may `catchUno` before the next action (+2).
- House rule `stacking` (default off): Draw Two may be answered with Draw Two.
- Scoring: round winner gets the face value of number cards and 20 per action card and 50 per wild left in opponents'
  hands. Game ends at `targetScore` (default 500).
- Reverse with two players acts as Skip. Winning card's effect is not applied (the round is over).
- Not implemented (deliberately): Seven-O, Jump-In, turn timers, chat, spectators, bots.

## Conventions

- TypeScript strict everywhere. Keep the engine **pure**: `applyAction` returns a new state (it clones) and throws
  `GameError` for illegal moves. No I/O, timers, or globals in `shared/`. Use the injected `rng` for randomness.
- Add a rule-level test to `shared/src/engine.test.ts` for every rule change. If you change engine behaviour, run
  `bun test shared` (the fuzz test catches invariant breaks).
- Tailwind v4: write class names as literal strings so they are detected. Dynamic class fragments such as
  `` `bg-${color}-500` `` will not be generated.
- UI text and error messages should be plain English and say what the player can do next.
- Don't store secrets or emails. Player "identity" is a random UUID plus a token held in `sessionStorage`.

## Gotchas learned the hard way

- **Wait for the first `room` snapshot before sending WebSocket messages.** Messages sent before the server's `open`
  handler has registered the socket are dropped silently. The client already does this because it only renders the
  game after it has a snapshot. The integration tests wait for the snapshot too.
- **Don't use `while (wild4)` reshuffle loops with a constant RNG.** `startRound` moves the wild card to the bottom
  instead. A constant RNG in tests once hung the whole test run.
- **A round that ends on a Draw Two does not apply the draw.** The engine returns early when someone goes out. That is
  correct, but tests that want to check a pending draw must give the next player more than one card.
- **Never run two servers on the same port.** Bun's default `reusePort` lets a second `bun src/index.ts` bind to :3001
  too, and requests then go to two separate in-memory room stores, so rooms appear to vanish at random. The server now
  passes `reusePort: false`, so a duplicate fails to start. If you see "Room not found" right after a room was created,
  check `ss -ltnp | grep 3001` first.
- **Vite re-optimizes dependencies on first load** after dependency or config changes and may reload the page. Let the
  page settle before interacting, or automated tests will see the room disappear.
- **Use `bun x tsc` for typechecking.** The installed TypeScript is 7.x. Each package has its own `tsconfig.json`
  extending `tsconfig.base.json`.
- Two empty directories exist: `/home/hunter87/Documents/projects/games/uno` (the project) and
  `/home/hunter87/Desktop/projects/games/uno` (empty). Work in the Documents one.

## Working agreement for agents

1. Plan changes in `PLAN.md` if they alter architecture or rules. Keep it in step with what was built.
2. Make a change, run `bun test` and `bun run typecheck`, then update the state section below.
3. Do not commit or push unless asked. Don't create branches or PRs without being asked either.
4. Don't add dependencies casually. Prefer the platform (Bun, Web APIs) before adding a package.
5. Leave the project building: `bun run build` must pass before you stop.

---

## Agent state

_Last updated: 2026-11-09 (refined game UI to exactly match target design: curved background ambient neon sweeps, dedicated SVG fanned mini UNO cards in opponent pods, oval emerald felt table with cyan-emerald neon rim, clean top header bar with double card logo and action pills, and bottom hand dock with pagination and sparkle playable badge)._

### Done

- Bun workspace scaffold (`shared`, `server`, `client`).
- Fixed Wild Draw 4 (+4), Wild +6, Wild +10, and Double Trouble card rendering: replaced SVG `<filter id="...">` references that failed to resolve in browsers with pure vector artwork and CSS drop shadows, added explicit `z-10` layer ordering over the white card oval, and updated card width classes (`w-22`) for reliable CSS compilation.
- Modularized domain enums into `shared/src/types.ts`.
- Complete game UI overhaul ("less like a website, more like a game"):
    - **Atmosphere & Theme**: Deep midnight gaming palette with magenta/violet ambient glow sweeps (`.game-canvas-bg`), glassmorphic pods (`.game-glass-pod`), and golden active turn glow (`.turn-active-glow`).
    - **Header Bar**: Overlapping double UNO cards mark, bold room code, "Play to {targetScore}" pill, restart & leave action pills on desktop, and hamburger menu button on mobile.
    - **Center Felt Table**: Luminous oval emerald felt table with neon cyan-emerald halo (`.game-table-felt`), draw pile with remaining count label, and discard pile with active color indicator badge on top-right.
    - **Opponent Seat Pods**: Rounded frosted glass cards displaying vibrant initial avatars, player name, card count, an inline CSS/SVG mini fan of overlapping red UNO cards (`OpponentCardFan`), and golden neon glowing active turn badge with live turn timer.
    - **Adaptive Layouts**:
        - Desktop: Orbital seating arrangement around the oval table (top row, left column, right column, bottom row).
        - Mobile: Stacked 2-column opponent grids above and below the center table.
    - **Bottom Hand Dock**: Anchored glass HUD dock (`.game-dock`) featuring `Your hand • X cards` header, glowing `✦ Y playable` badge, interactive overlapping cards with hover lift, `<` and `>` arrow navigation, pagination dots (`● ○ ○ ○`) on mobile/multi-page, and integrated Quick Action HUD for Draw, Pass, Call UNO (hot red pulse), and Shield.
    - **Mobile Game Menu**: Collapsible modal menu for mobile devices providing room status, rules, layout mode toggle, game log, room restart, and leave actions.
- Synthesized Web Audio effects for all actions and card events.
- Unit and integration test suites passing cleanly across all workspaces.

### Verified

- `bun test`: 73 tests pass across 4 test suites (`shared`, `server`, `client/sound`).
- `bun run typecheck`: clean across all 3 workspaces (`@uno/shared`, `@uno/server`, `@uno/client`).
- `bun run build`: production client build succeeds.

### Next

- Client UI tests (none yet). Consider a Playwright script under `client/e2e/` if it should live in the repo.
- Mobile layout polish (hand overlap is tuned for ≥ 360px wide screens; not checked on a real device).

### Known limitations / ideas

- Rooms are in-memory; a server restart loses all games.
- No turn timer UI, chat, spectators, bots, Seven-O or Jump-In.
- Client has no automated UI tests yet.

### Decisions log

- Elysia native `.ws()` instead of socket.io: fewer deps, Bun-native, and the server is already Elysia.
- Engine lives in `shared/` so rules are one copy, testable without a server, and the client can import types.
- Card art is CSS/SVG, so there are no asset licensing concerns and no image downloads.
- Session token in `sessionStorage`: refresh reconnects; new tabs start fresh. Names remembered in `localStorage` as a convenience.
