import { FBISection } from '.';
import { FBIParserError } from './fbi-errors';

enum State {
    Content,
    HeaderStart, HeaderEnd,
    FieldName, FieldValue, // TODO
}

const SYMBOLS = ['[', ']', '{', '}', '=', ';'];
const SINGLE_LINE_COMMENT = '//';
const MULTI_LINE_COMMENT_START = '/*';
const MULTI_LINE_COMMENT_END = '*/';

export interface FBIParserOptions {
    strict: boolean; // default: true
    formatFieldName?: (fieldName: string) => string;    // these formatters are useful for forcing lowercase for example
    formatFieldValue?: (fieldValue: string) => string;
    formatSectionHeader?: (sectionHeader: string) => string;
}

const DEFAULT_OPTIONS: FBIParserOptions = {
    strict: true,
}

export interface FBIParserResult {
    value?: FBISection;
    error?: FBIParserError;
}

export class FBIParserContext {
    private options: FBIParserOptions;

    constructor(options?: FBIParserOptions) {
        this.options = options ?? DEFAULT_OPTIONS;
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
        let insideMultilineComment = false;

        outer:for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            let line = lines[lineIdx];

            for (let charIdx = 0; charIdx < line.length; charIdx++) {
                let char = line[charIdx];

                if (testWordMatch(MULTI_LINE_COMMENT_END, line, charIdx)) {
                    insideMultilineComment = false;
                    // skip the current character + the rest of the multiLineComment word
                    charIdx += MULTI_LINE_COMMENT_END.length - 1; // -1 is because the 'continue;' below already skips 1 char
                    continue;
                }

                if (insideMultilineComment) {
                    continue;
                }

                if (testWordMatch(MULTI_LINE_COMMENT_START, line, charIdx)) {
                    insideMultilineComment = true;
                    // skip the current character + the rest of the multiLineComment word
                    charIdx += MULTI_LINE_COMMENT_START.length - 1; // -1 is because the 'continue;' below already skips 1 char
                    continue;
                }

                if (testWordMatch(SINGLE_LINE_COMMENT, line, charIdx)) {
                    continue outer; // skip the rest of the line
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

                        let newSection = new FBISection(
                            this.options.formatSectionHeader
                                ? this.options.formatSectionHeader(name.trim())
                                : name.trim()
                        );

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
                            name: this.options.formatFieldName
                                ? this.options.formatFieldName(fieldName)
                                : fieldName,
                            value: this.options.formatFieldValue
                                ? this.options.formatFieldValue(fieldValue.trim())
                                : fieldValue.trim(),
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

function isSymbol(str: string) {
    return SYMBOLS.some(next => next === str);
}

function isWhitespace(str: string) {
    // return str === ' ' || str === '\n' || str === '\t';
    return str === '\0' || /\s/.test(str);
}

function testWordMatch(word: string, line: string[], charIdx: number) {
    for (let comIdx = 0; comIdx < word.length; comIdx++) {
        let testIdx = charIdx + comIdx;
        if (testIdx === line.length)
            break;

        let testChar = line[testIdx];
        if (testChar !== word[comIdx])
            break;

        if (comIdx === word.length - 1) {
            return true;
        }
    }

    return false;
}

// for backward compatibility
export const FBIParser = new FBIParserContext();
