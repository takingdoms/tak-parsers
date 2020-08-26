export class FBIParserError extends Error {
    readonly char: string;
    readonly lineIdx: number;
    readonly charIdx: number;
    readonly reason: string;

    constructor(char: string, lineIdx: number, charIdx: number, reason?: string) {
        let charSanitized = char;

        [
            ['\r', '␍'],
            ['\n', '␤'],
            ['\0', '␀'],
        ].forEach(([a, b]) => {
            charSanitized = charSanitized.replace(a, b);
        });

        let message = `Invalid character "${charSanitized}" at ${lineIdx + 1}:${charIdx + 1}`;
        if (reason) message += `\n${reason}`;

        super(message);

        this.char = char;
        this.lineIdx = lineIdx;
        this.charIdx = charIdx;
        this.reason = reason;
    }
}
