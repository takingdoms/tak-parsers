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

const COMMENT = '#';

function isSymbol(str: string) {
    return SYMBOLS.some(next => next === str);
}

function isWhitespace(str: string) {
    // return str === ' ' || str === '\n' || str === '\t';
    return str === '\0' || /\s/.test(str);
}

export const FBIParser = {
    load(data: Buffer) {
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

                /*if (char === COMMENT) {
                    // skip the entire line
                    continue outer;
                }*/

                if (state === State.Content) {
                    if (isWhitespace(char)) {
                        continue;
                    }

                    if (char === '[') {
                        state = State.HeaderStart;
                        name = '';
                    }
                    else if (char === '{') {
                        throw new ParserError(char, lineIdx, charIdx);
                    }
                    else if (char === '}') {
                        if (sectionStack.length === 1) {
                            throw new ParserError(char, lineIdx, charIdx, `There was no "{" to close.`);
                        }

                        state = State.Content;
                        sectionStack.pop();
                        topSection = sectionStack[sectionStack.length - 1];
                    }
                    else if (isSymbol(char)) {
                        throw new ParserError(char, lineIdx, charIdx);
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
                            throw new ParserError(char, lineIdx, charIdx, `There can't be whitespace inside a header's name.`);
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
                        throw new ParserError(char, lineIdx, charIdx, `Can't have symbols inside a header's name.`);
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
                        throw new ParserError(char, lineIdx, charIdx);
                    }
                }
                else if (state === State.FieldName) {
                    if (isWhitespace(char)) {
                        let nextChar = charIdx < line.length - 1 ? line[charIdx + 1] : null;

                        if (!isWhitespace(nextChar) && nextChar !== '=') {
                            throw new ParserError(char, lineIdx, charIdx, `There can't be whitespace inside a field's name.`);
                        }

                        continue;
                    }

                    if (char === '=') {
                        state = State.FieldValue;
                        fieldValue = '';
                    }
                    else if (isSymbol(char)) {
                        throw new ParserError(char, lineIdx, charIdx, 'Invalid field definition.');
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
                        throw new ParserError(char, lineIdx, charIdx, 'Invalid field definition.');
                    }
                    else {
                        fieldValue += char;
                    }
                }
            }
        }

        if (state !== State.Content) {
            throw new Error(`Incomplete file. Maybe you're missing a ] or }.`);1
        }

        return topSection;
    }
}

class ParserError extends Error {
    constructor(char: string, lineIdx: number, charIdx: number, msg?: string) {
        let str = `Invalid character "${char}" at ${lineIdx + 1}:${charIdx + 1}`;
        if (msg) str += `\n${msg}`;

        super(str);
    }
}