import { ActionType, COLORS, Color } from "@uno/shared";
import { t } from "elysia";

export const ColorSchema = t.Enum(Color);

export const ActionSchema = t.Union([
    t.Object({
        type: t.Literal(ActionType.Play),
        cardId: t.String({ maxLength: 64 }),
        color: t.Optional(ColorSchema),
        uno: t.Optional(t.Boolean()),
    }),
    t.Object({ type: t.Literal(ActionType.Draw) }),
    t.Object({ type: t.Literal(ActionType.Pass) }),
    t.Object({
        type: t.Literal(ActionType.CatchUno),
        target: t.String({ maxLength: 64 }),
    }),
    t.Object({ type: t.Literal(ActionType.CallUno) }),
]);

import { ClientMessageType, NAME_MAX_LENGTH } from "@uno/shared";

export const ClientMessageSchema = t.Union([
    t.Object({
        type: t.Literal(ClientMessageType.Settings),
        rules: t.Partial(
            t.Object({
                stacking: t.Boolean(),
                targetScore: t.Number(),
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
