export interface FBIField {
    name: string;
    value: string;
}

export class FBISection {
    readonly header: string;
    readonly fields: FBIField[];
    readonly sections: FBISection[];

    constructor(name: string) {
        this.header = name;
        this.fields = [];
        this.sections = [];
    }

    debugPrint(padding: string = '') {
        console.log(`${padding}[${this.header}]`);
        console.log(`${padding}Fields: ${this.fields.length}`);
        this.sections.forEach(section => section.debugPrint(padding + '    '));
    }

    val(key: string): string {
        let field = this.fields.find(f => f.name === key);
        if (field !== undefined)
            return field.value;
    }

    get(key: string): FBISection {
        return this.sections.find(s => s.header === key);
    }

    toRawObj(): any {
        let obj: any = {};
        this.sections.forEach(section => {
            obj['[' + section.header + ']'] = section.toRawObj();
        });

        this.fields.forEach(f => obj[f.name] = f.value);

        return obj;
    }
}

enum State {
    Content,
    HeaderStart, HeaderEnd,
    FieldName, FieldValue, // TODO
}

const SYMBOLS = ['[', ']', '{', '}', '=', ';'];
const COMMENT = '//';

function isSymbol(str: string) {
    return SYMBOLS.some(next => next === str);
}

function isWhitespace(str: string) {
    // return str === ' ' || str === '\n' || str === '\t';
    return str === '\0' || /\s/.test(str);
}

export interface FBIParserOptions {
    strict?: boolean; // default: true
}

export interface FBIParserResult {
    value?: FBISection;
    error?: FBIParserError;
}

export class FBIParserContext {
    private options: FBIParserOptions;

    constructor(options?: FBIParserOptions) {
        this.options = {
            strict: options?.strict !== undefined ? options.strict : true,
        };
    }

    loadResult(data: Buffer): FBIParserResult {
        let str = data.toString('utf8');
        let lines = str.split('\n').map(line => line.split(''));

        let topSection = new FBISection(''); // empty section AKA "Root Section"
        let sectionStack: FBISection[] = [];
        sectionStack.push(topSection);

        let state = State.Content;
        let name: string = null;
        let fieldName: string = null;
        let fieldValue: string = null;

        let last: string = null;

        outer:for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];

            for (let charIdx = 0; charIdx < line.length; charIdx++) {
                let char = line[charIdx];
                last = char;

                for (let comIdx = 0; comIdx < COMMENT.length; comIdx++) {
                    let testIdx = charIdx + comIdx;
                    if (testIdx === line.length)
                        break;

                    let testChar = line[testIdx];
                    if (testChar !== COMMENT[comIdx])
                        break;

                    if (comIdx === COMMENT.length - 1) {
                        // skip the entire line
                        continue outer;
                    }
                }

                if (state === State.Content) {
                    if (isWhitespace(char)) {
                        continue;
                    }

                    if (char === '[') {
                        state = State.HeaderStart;
                        name = '';
                    }
                    else if (char === '{') {
                        return { error: new FBIParserError(char, lineIdx, charIdx) };
                    }
                    else if (char === '}') {
                        if (sectionStack.length === 1) {
                            return { error: new FBIParserError(char, lineIdx, charIdx, `There was no "{" to close.`) };
                        }

                        state = State.Content;
                        sectionStack.pop();
                        topSection = sectionStack[sectionStack.length - 1];
                    }
                    else if (isSymbol(char)) {
                        if (!this.options.strict && char === ';')
                            continue;

                        return { error: new FBIParserError(char, lineIdx, charIdx) };
                    }
                    else {
                        state = State.FieldName;
                        fieldName = char;
                    }
                }
                else if (state === State.HeaderStart) {
                    if (isWhitespace(char)) {
                        let nextChar = charIdx < line.length - 1 ? line[charIdx + 1] : null;

                        if (name.length > 0 && !isWhitespace(nextChar) && nextChar !== ']') {
                            return { error: new FBIParserError(char, lineIdx, charIdx, `There can't be whitespace inside a header's name.`) };
                        }

                        continue;
                    }

                    if (char === ']') {
                        state = State.HeaderEnd;

                        let newSection = new FBISection(name.trim());
                        topSection.sections.push(newSection);
                        sectionStack.push(newSection);
                        topSection = newSection;
                    }
                    else if (isSymbol(char)) {
                        return { error: new FBIParserError(char, lineIdx, charIdx, `Can't have symbols inside a header's name.`) };
                    }
                    else {
                        name += char;
                    }
                }
                else if (state === State.HeaderEnd) {
                    if (isWhitespace(char)) {
                        continue;
                    }

                    if (char === '{') {
                        state = State.Content;
                    }
                    else {
                        return { error: new FBIParserError(char, lineIdx, charIdx) };
                    }
                }
                else if (state === State.FieldName) {
                    if (isWhitespace(char)) {
                        let nextChar = charIdx < line.length - 1 ? line[charIdx + 1] : null;

                        if (!isWhitespace(nextChar) && nextChar !== '=') {
                            console.log('@');
                            console.log('|' + char + '|');
                            console.log('@');
                            return { error: new FBIParserError(char, lineIdx, charIdx, `There can't be whitespace inside a field's name.`) };
                        }

                        continue;
                    }

                    if (char === '=') {
                        state = State.FieldValue;
                        fieldValue = '';
                    }
                    else if (isSymbol(char)) {
                        return { error: new FBIParserError(char, lineIdx, charIdx, 'Invalid field definition.') };
                    }
                    else {
                        fieldName += char;
                    }
                }
                else if (state === State.FieldValue) {
                    if (char === ';') {
                        state = State.Content;
                        topSection.fields.push({
                            name: fieldName,
                            value: fieldValue.trim()
                        });
                    }
                    else if (isSymbol(char)) {
                        return { error: new FBIParserError(char, lineIdx, charIdx, 'Invalid field definition.') };
                    }
                    else {
                        fieldValue += char;
                    }
                }
            }
        }

        if (state !== State.Content) {
            return { error: new FBIParserError(null, null, null, `Incomplete file. Maybe you're missing a ] or }.`) };
        }

        return { value: topSection };
    }

    load(data: Buffer) { // for backward compatibility
        let result = this.loadResult(data);
        if (result.error)
            throw result.error;
        return result.value;
    }
}

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

// for backward compatibility
export const FBIParser = new FBIParserContext();
