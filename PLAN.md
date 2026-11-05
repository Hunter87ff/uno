# UNO Online — Implementation Plan

## Goals
- Browser-based UNO, multiplayer, **no accounts/signup**.
- Create a room → get a short code → share it → others join by entering a **name unique within the room**.
- Full standard UNO: number/skip/reverse/draw-two/wild/wild-draw-four cards, UNO call + catch penalty,
  draw-and-play-drawn-card rule, scoring across rounds to a target score.
- Optional house rules (set by host in lobby): stacking of Draw Two.
- Runtime: **Bun** everywhere (no Node). Backend **Elysia** (REST + native WebSocket). Frontend **React + Vite + Tailwind v4**.
- No 3D library (not needed). Card art is pure SVG/CSS — no external assets, so no licensing concerns.

## Architecture (Bun workspaces monorepo)
```
shared/   @uno/shared  Pure TS: card model, game engine (rules), protocol types. No I/O. Unit-tested.
server/   @uno/server  Elysia app. REST for create/join, WebSocket for live state. In-memory rooms.
client/   @uno/client  Vite + React + Tailwind. Home / Lobby / Game screens. Talks to server via fetch + WS.
```
The engine in `shared/` is the single source of truth for rules and runs **only on the server** (authoritative);
the client renders server snapshots and never decides legality.

## Engine (`shared/src/engine.ts`)
- `startRound(playerIds, rules, rng?)` → deals 7 cards, flips a legal starting card (re-shuffles Wild Draw Four back in).
- `applyAction(state, playerId, action)` → returns a new state or throws `GameError`. Pure (state is cloned).
- `suggestAction(state, playerId)` → used for auto-play when a player disconnects.
- `viewFor(state, viewerId)` → per-player public view: own hand visible, opponents only get card counts.
- Actions: `play {cardId, color?, uno?}`, `draw`, `pass`, `catchUno {target}`, `callUno`.

### Turn flow
0. The host picks cards per player (2–15, default 7) and presses "Shuffle & deal". The server shuffles, deals and starts the round.
1. Player plays a matching card (color / number / same action type) or any Wild.
2. Draw and pass: players may draw a card on their turn even if they hold playable cards. Once drawn, the player may play the drawn card or pass their turn.
3. Pending draws (from Draw Two / Wild Draw Four) force the target to `draw` and lose their turn.
4. Going down to one card requires `uno: true` on the play; otherwise anyone can `catchUno` the player (+2 penalty)
   before the next action happens.
5. Round ends when a hand empties; winner scores the points of cards left in opponents' hands
   (number = face value, action = 20, wild = 50). Game ends when a player reaches `targetScore` (default 500).

## Server (`server/src`)
- `POST /api/rooms` `{name}` → creates room, returns `{code, playerId, token}`; creator is host.
- `POST /api/rooms/:code/join` `{name}` → 409 if name taken in that room (case-insensitive), 404 if no room,
  409 if game already started.
- `WS /ws?room=CODE&token=TOKEN` → auth by token (reconnect supported). Server pushes `room` snapshots after every change.
- Client → server messages: `settings`, `start`, `kick`, `nextRound`, `resetRoom`, `leave`, `action`.
- Disconnected player on turn: server auto-plays after a grace period (`suggestAction`), so games never stall. When a player leaves voluntarily, their hand is recycled and they are removed from the room.
- Host can restart an in-progress game back to the lobby at any time with `resetRoom`.
- Empty rooms are deleted after a timeout.

## Client (`client/src`)
- Home: create room / join room (code + name).
- Lobby: player list, host settings (stacking, challenge, target score), host starts game, kick players.
- Game: opponents with card counts, UNO / "catch" indicators, draw & discard piles, active color & direction,
  own hand (playable cards highlighted), color picker for wild cards, round/score overlay.
- Session stored in `sessionStorage` (`{code, playerId, token}`) so refresh reconnects.

## Milestones
1. [x] Plan + monorepo scaffold (Bun workspaces).
2. [x] Shared engine + unit tests + randomized full-game invariant tests (`bun test`).
3. [x] Elysia server: REST + WS + room manager (integration-tested).
4. [x] React client: home, lobby, game table, card components, Tailwind styling.
5. [x] Polish: reconnection, auto-play for disconnects, error toasts. Responsive layout: basic (hand scrolls on narrow screens).
6. [x] Automated two-browser game in headless Chrome (lobby, duplicate-name rejection, full round to round-over). README written.

## Out of scope (possible later)
- Persistence (rooms are in-memory and lost on server restart).
- Turn timer UI, chat, spectators, bots, mobile-native packaging.
- Seven-O and Jump-In house rules.
