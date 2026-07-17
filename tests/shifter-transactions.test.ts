import { describe, expect, it, vi } from 'vitest';
import { ApplyHeading } from '../src/headings/shifter/features/apply';
import { InsertHeadingAtCurrentLevel, InsertHeadingAtDeeperLevel } from '../src/headings/shifter/features/insert';
import { DecreaseHeading, IncreaseHeading } from '../src/headings/shifter/features/shift';
import { dispatchHeadingChanges } from '../src/headings/shifter/utils/editorChange';
import { DEFAULT_MY_HEADINGS_SETTINGS } from '../src/settings';

type Position = { line: number; ch: number };
type Change = { text: string; from: Position; to?: Position };

class MockEditor {
    private lines: string[];
    private from: Position;
    private to: Position;
    transactions: Change[][] = [];
    setCursor = vi.fn(() => {
        throw new Error('setCursor must not be called after a transaction');
    });

    constructor(source: string, from: Position = { line: 0, ch: 0 }, to: Position = from) {
        this.lines = source.split('\n');
        this.from = from;
        this.to = to;
    }

    getValue(): string {
        return this.lines.join('\n');
    }

    getLine(line: number): string {
        if (line < 0 || line >= this.lines.length) throw new RangeError('line outside document');
        return this.lines[line];
    }

    lineCount(): number {
        return this.lines.length;
    }

    getCursor(which?: 'from' | 'to' | 'head' | 'anchor'): Position {
        return which === 'to' || which === 'head' ? { ...this.to } : { ...this.from };
    }

    setSelection(): void {}

    transaction(transaction: { changes?: Change[] }): void {
        const changes = transaction.changes ?? [];
        this.transactions.push(changes);
        const source = this.getValue();
        const lineStarts: number[] = [];
        let offset = 0;
        for (const line of this.lines) {
            lineStarts.push(offset);
            offset += line.length + 1;
        }
        const at = (position: Position) => lineStarts[position.line] + position.ch;
        let next = source;
        for (const change of [...changes].sort((left, right) => at(right.from) - at(left.from))) {
            const from = at(change.from);
            const to = at(change.to ?? change.from);
            next = next.slice(0, from) + change.text + next.slice(to);
        }
        this.lines = next.split('\n');
    }
}

const settings = {
    ...DEFAULT_MY_HEADINGS_SETTINGS,
    list: { ...DEFAULT_MY_HEADINGS_SETTINGS.list },
    editor: { ...DEFAULT_MY_HEADINGS_SETTINGS.editor },
};

describe('Heading Shifter transactions', () => {
    it('shifts one or many headings without a second cursor write', () => {
        const single = new MockEditor('## Title');
        expect(new IncreaseHeading(settings, false).editorCallback(single as never)).toBe(true);
        expect(single.getValue()).toBe('### Title');
        expect(single.setCursor).not.toHaveBeenCalled();

        expect(new DecreaseHeading(settings).editorCallback(single as never)).toBe(true);
        expect(single.getValue()).toBe('## Title');
        expect(single.setCursor).not.toHaveBeenCalled();

        const multiple = new MockEditor(
            '# First\n## Second',
            { line: 0, ch: 0 },
            { line: 1, ch: 9 },
        );
        expect(new IncreaseHeading(settings, false).editorCallback(multiple as never)).toBe(true);
        expect(multiple.getValue()).toBe('## First\n### Second');
        expect(multiple.transactions).toHaveLength(1);
        expect(multiple.setCursor).not.toHaveBeenCalled();
    });

    it('does not dispatch a no-op or access a line beyond the end of the document', () => {
        const editor = new MockEditor('## Title', { line: 0, ch: 8 });
        expect(new ApplyHeading(settings, 2).editorCallback(editor as never)).toBe(false);
        expect(editor.transactions).toEqual([]);

        expect(new ApplyHeading(settings, 3).editorCallback(editor as never)).toBe(true);
        expect(editor.getValue()).toBe('### Title');
        expect(editor.setCursor).not.toHaveBeenCalled();
    });

    it('uses the same safe dispatcher for inserted headings', () => {
        const editor = new MockEditor('# Parent\nChild', { line: 1, ch: 5 });
        expect(new InsertHeadingAtCurrentLevel(settings).editorCallback(editor as never)).toBe(true);
        expect(editor.getValue()).toBe('# Parent\n# Child');
        expect(editor.transactions).toHaveLength(1);
        expect(editor.setCursor).not.toHaveBeenCalled();

        const deeper = new MockEditor('# Parent\nChild', { line: 1, ch: 5 });
        expect(new InsertHeadingAtDeeperLevel(settings).editorCallback(deeper as never)).toBe(true);
        expect(deeper.getValue()).toBe('# Parent\n## Child');
        expect(deeper.setCursor).not.toHaveBeenCalled();
    });

    it('deduplicates identical edits and rejects invalid or overlapping batches atomically', () => {
        const deduplicated = new MockEditor('Title');
        const replacement: Change = {
            text: '# Title',
            from: { line: 0, ch: 0 },
            to: { line: 0, ch: 5 },
        };
        expect(dispatchHeadingChanges(deduplicated as never, [replacement, replacement]))
            .toBe('applied');
        expect(deduplicated.transactions[0]).toHaveLength(1);

        const invalid = new MockEditor('Title');
        expect(dispatchHeadingChanges(invalid as never, [{
            text: 'Invalid',
            from: { line: 1, ch: 0 },
            to: { line: 1, ch: 0 },
        }])).toBe('rejected');
        expect(invalid.getValue()).toBe('Title');
        expect(invalid.transactions).toEqual([]);

        const overlapping = new MockEditor('Title');
        expect(dispatchHeadingChanges(overlapping as never, [
            { text: 'A', from: { line: 0, ch: 0 }, to: { line: 0, ch: 3 } },
            { text: 'B', from: { line: 0, ch: 2 }, to: { line: 0, ch: 5 } },
        ])).toBe('rejected');
        expect(overlapping.getValue()).toBe('Title');
        expect(overlapping.transactions).toEqual([]);
    });
});
