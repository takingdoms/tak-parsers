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
