export function parseFrontMatterEntry(frontmatter: Record<string, unknown>, key: string): unknown {
    return frontmatter[key];
}

export class MarkdownView {}

export class Modal {
    app: any;
    contentEl: any = {};
    constructor(app: any) {
        this.app = app;
    }
    open(): void {}
    close(): void {}
}

export const noticeMessages: string[] = [];

export class Notice {
    constructor(message: string) {
        noticeMessages.push(message);
    }
}

export class Setting {
    settingEl: any = {};
    constructor(_container?: any) {}
    setName(): this { return this; }
    setDesc(): this { return this; }
    setClass(): this { return this; }
    addToggle(): this { return this; }
    addButton(): this { return this; }
    addDropdown(): this { return this; }
    addSlider(): this { return this; }
}

export const editorInfoField = {};
