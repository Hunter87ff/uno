import { ActionType, COLORS, Color, ClientMessageType, NAME_MAX_LENGTH } from "@uno/shared";
import { t } from "elysia";

export const ColorSchema = t.Enum(Color);

export const ActionSchema = t.Union([
    t.Object({
        type: t.Literal(ActionType.Play),
        cardId: t.String({ maxLength: 64 }),
        color: t.Optional(ColorSchema),
        uno: t.Optional(t.Boolean()),
        target: t.Optional(t.String({ maxLength: 64 })),
    }),
    t.Object({ type: t.Literal(ActionType.Draw) }),
    t.Object({ type: t.Literal(ActionType.Pass) }),
    t.Object({
        type: t.Literal(ActionType.CatchUno),
        target: t.String({ maxLength: 64 }),
    }),
    t.Object({ type: t.Literal(ActionType.CallUno) }),
    t.Object({
        type: t.Literal(ActionType.PlayShield),
        cardId: t.String({ maxLength: 64 }),
    }),
]);

export const CustomCardsSchema = t.Partial(
    t.Object({
        doubleTrouble: t.Boolean(),
        swapHands: t.Boolean(),
        snatch: t.Boolean(),
        shield: t.Boolean(),
        wild6: t.Boolean(),
        wild10: t.Boolean(),
    }),
);

export const ClientMessageSchema = t.Union([
    t.Object({
        type: t.Literal(ClientMessageType.Settings),
        rules: t.Partial(
            t.Object({
                stacking: t.Boolean(),
                targetScore: t.Number(),
                turnTimer: t.Number(),
                eliminationLimit: t.Nullable(t.Number()),
                cards: CustomCardsSchema,
            }),
        ),
    }),
    t.Object({ type: t.Literal(ClientMessageType.Start), cardsPerPlayer: t.Number() }),
    t.Object({ type: t.Literal(ClientMessageType.NextRound) }),
    t.Object({ type: t.Literal(ClientMessageType.ResetRoom) }),
    t.Object({ type: t.Literal(ClientMessageType.Kick), playerId: t.String({ maxLength: 64 }) }),
    t.Object({ type: t.Literal(ClientMessageType.Leave) }),
    t.Object({ type: t.Literal(ClientMessageType.Action), action: ActionSchema }),
]);

export const CreateRoomBody = t.Object({
    name: t.String({ maxLength: NAME_MAX_LENGTH * 4 }),
});

export const JoinRoomBody = CreateRoomBody;
