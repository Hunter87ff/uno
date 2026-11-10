/** Thrown by engine functions for illegal moves; the server turns it into an error message. */
export class GameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "GameError";
    }
}
