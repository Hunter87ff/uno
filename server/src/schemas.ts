import { COLORS, NAME_MAX_LENGTH } from "@uno/shared";
import { t } from "elysia";

const Color = t.Union(COLORS.map((c) => t.Literal(c)));

export const ActionSchema = t.Union([
  t.Object({
    type: t.Literal("play"),
    cardId: t.String({ maxLength: 64 }),
    color: t.Optional(Color),
    uno: t.Optional(t.Boolean()),
  }),
  t.Object({ type: t.Literal("draw") }),
  t.Object({ type: t.Literal("pass") }),
  t.Object({ type: t.Literal("challenge") }),
  t.Object({ type: t.Literal("accept") }),
  t.Object({
    type: t.Literal("catchUno"),
    target: t.String({ maxLength: 64 }),
  }),
  t.Object({ type: t.Literal("callUno") }),
]);

export const ClientMessageSchema = t.Union([
  t.Object({
    type: t.Literal("settings"),
    rules: t.Partial(
      t.Object({
        stacking: t.Boolean(),
        challengeWild4: t.Boolean(),
        targetScore: t.Number(),
      }),
    ),
  }),
  t.Object({ type: t.Literal("start"), cardsPerPlayer: t.Number() }),
  t.Object({ type: t.Literal("nextRound") }),
  t.Object({ type: t.Literal("kick"), playerId: t.String({ maxLength: 64 }) }),
  t.Object({ type: t.Literal("leave") }),
  t.Object({ type: t.Literal("action"), action: ActionSchema }),
]);

export const CreateRoomBody = t.Object({
  name: t.String({ maxLength: NAME_MAX_LENGTH * 4 }),
});

export const JoinRoomBody = CreateRoomBody;
