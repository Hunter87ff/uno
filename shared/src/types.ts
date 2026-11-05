// Domain Enums and Constants

export enum Color {
    Red = 'red',
    Yellow = 'yellow',
    Green = 'green',
    Blue = 'blue',
}

export enum SpecialColor {
    Wild = 'wild',
}

export type CardColor = Color | SpecialColor.Wild;

export enum CardType {
    Number = 'number',
    Skip = 'skip',
    Reverse = 'reverse',
    Draw2 = 'draw2',
    Wild = 'wild',
    Wild4 = 'wild4',
}

export enum RoomStatus {
    Lobby = 'lobby',
    Playing = 'playing',
    RoundOver = 'roundOver',
    GameOver = 'gameOver',
}

export enum ActionType {
    Play = 'play',
    Draw = 'draw',
    Pass = 'pass',
    CatchUno = 'catchUno',
    CallUno = 'callUno',
}

export enum ClientMessageType {
    Settings = 'settings',
    Start = 'start',
    NextRound = 'nextRound',
    ResetRoom = 'resetRoom',
    Kick = 'kick',
    Leave = 'leave',
    Action = 'action',
}

export enum ServerMessageType {
    Room = 'room',
    Error = 'error',
}

export enum CloseCode {
    InvalidSession = 4401,
    Removed = 4403,
    ForbiddenOrigin = 4404,
}

export const COLORS: readonly Color[] = Object.freeze([
    Color.Red,
    Color.Yellow,
    Color.Green,
    Color.Blue,
]);

export enum SfxType {
    Play = 'play',
    Skip = 'skip',
    Reverse = 'reverse',
    Draw2 = 'draw2',
    Wild = 'wild',
    Wild4 = 'wild4',
    Draw = 'draw',
    Shuffle = 'shuffle',
    Turn = 'turn',
    Uno = 'uno',
    Catch = 'catch',
    RoundWin = 'roundWin',
    GameWin = 'gameWin',
    Join = 'join',
    Error = 'error',
}
