
import { Editor, EditorChange, EditorRange, EditorPosition, HeadingCache } from 'obsidian';

// ====================================================================================
// Numbering Token Definitions & Logic
// ====================================================================================

export type NumberingStyle = '1' | 'A' | 'a' | 'I' | '一' | '①';

export interface NumberingToken {
    style: NumberingStyle;
    value: any;
}

const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const circledNumbers = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

function isValidArabicNumberingValueString(s: string): boolean {
    return /^[0-9]+$/.test(s);
}

function isValidAlphabetNumberingValueString(s: string): boolean {
    return /^[a-zA-Z]+$/.test(s);
}

export function zerothNumberingTokenInStyle(style: NumberingStyle, startValue: string): NumberingToken {
    switch (style) {
        case '1':
            return { style: '1', value: parseInt(startValue) - 1 || 0 };
        case 'A':
            if (startValue === 'A') return { style: 'A', value: 'Z' };
            else return { style: 'A', value: String.fromCharCode(startValue.charCodeAt(0) - 1) };
        case 'a':
            if (startValue === 'a') return { style: 'a', value: 'z' };
            else return { style: 'a', value: String.fromCharCode(startValue.charCodeAt(0) - 1) };
        case 'I': // Roman numerals logic (simplified for now as not explicitly detailed in provided source excerpt, but good practice)
            return { style: 'I', value: 0 };
        case '一':
            return { style: '一', value: '零' };
        case '①':
            return { style: '①', value: '⓪' };
    }
    return { style: '1', value: 0 };
}

export function firstNumberingTokenInStyle(style: NumberingStyle, startValue: string): NumberingToken {
    const startNum = parseInt(startValue);
    const isNumericStart = !isNaN(startNum);

    switch (style) {
        case '1':
            return { style: '1', value: startNum };
        case 'A':
            if (isNumericStart) {
                if (startNum === 0) return { style: 'A', value: '&' };
                if (startNum > 0) return { style: 'A', value: String.fromCharCode('A'.charCodeAt(0) + startNum - 1) };
                return { style: 'A', value: 'A' };
            }
            return { style: 'A', value: startValue || 'A' };
        case 'a':
            if (isNumericStart) {
                if (startNum === 0) return { style: 'a', value: '&' };
                if (startNum > 0) return { style: 'a', value: String.fromCharCode('a'.charCodeAt(0) + startNum - 1) };
                return { style: 'a', value: 'a' };
            }
            return { style: 'a', value: startValue || 'a' };
        case '一':
            if (isNumericStart) {
                if (startNum >= 0 && startNum < chineseNumbers.length) {
                    return { style: '一', value: chineseNumbers[startNum] };
                }
                if (startNum >= chineseNumbers.length) {
                    return { style: '一', value: String(startNum) }; // Fallback to arabic if overflow
                }
            }
            return { style: '一', value: startValue || '一' };
        case '①':
            if (isNumericStart) {
                if (startNum >= 0 && startNum < circledNumbers.length) {
                    return { style: '①', value: circledNumbers[startNum] };
                }
                if (startNum >= circledNumbers.length) {
                    return { style: '①', value: String(startNum) };
                }
            }
            return { style: '①', value: startValue || '①' };
    }
    return { style: '1', value: 1 };
}

export function nextNumberingToken(t: NumberingToken): NumberingToken {
    switch (t.style) {
        case '1':
            return { style: '1', value: t.value + 1 };
        case 'A':
            if (t.value === '&') return { style: 'A', value: 'A' };
            if (t.value === 'Z') return { style: 'A', value: 'A' }; // Loop or reset
            return { style: 'A', value: String.fromCharCode(t.value.charCodeAt(0) + 1) };
        case 'a':
            if (t.value === '&') return { style: 'a', value: 'a' };
            if (t.value === 'z') return { style: 'a', value: 'a' };
            return { style: 'a', value: String.fromCharCode(t.value.charCodeAt(0) + 1) };
        case '一':
            const cnIndex = chineseNumbers.indexOf(t.value);
            if (cnIndex > -1 && cnIndex < chineseNumbers.length - 1) {
                return { style: '一', value: chineseNumbers[cnIndex + 1] };
            }
            if (cnIndex === chineseNumbers.length - 1) return { style: '一', value: '11' };
            const cnNum = parseInt(t.value);
            if (!isNaN(cnNum)) return { style: '一', value: String(cnNum + 1) };
            return { style: '一', value: '一' };
        case '①':
            const cIndex = circledNumbers.indexOf(t.value);
            if (cIndex > -1 && cIndex < circledNumbers.length - 1) {
                return { style: '①', value: circledNumbers[cIndex + 1] };
            }
            if (cIndex === circledNumbers.length - 1) return { style: '①', value: '21' };
            const cNum = parseInt(t.value);
            if (!isNaN(cNum)) return { style: '①', value: String(cNum + 1) };
            return { style: '①', value: '①' };
    }
    return { style: '1', value: t.value + 1 };
}

export function previousNumberingToken(t: NumberingToken): NumberingToken {
    switch (t.style) {
        case '1':
            return { style: '1', value: t.value - 1 };
        case 'A':
            if (t.value === 'A') return { style: 'A', value: '&' };
            if (t.value === '&') return { style: 'A', value: 'Z' };
            else return { style: 'A', value: String.fromCharCode(t.value.charCodeAt(0) - 1) };
        case 'a':
            if (t.value === 'a') return { style: 'a', value: '&' };
            if (t.value === '&') return { style: 'a', value: 'z' };
            else return { style: 'a', value: String.fromCharCode(t.value.charCodeAt(0) - 1) };
        case '一':
            const num = parseInt(t.value);
            if (!isNaN(num)) {
                if (num > 11) return { style: '一', value: String(num - 1) };
                if (num === 11) return { style: '一', value: '十' };
            }
            const currentIndex = chineseNumbers.indexOf(t.value);
            if (currentIndex > 0) return { style: '一', value: chineseNumbers[currentIndex - 1] };
            return { style: '一', value: '零' };
        case '①':
            const circledNum = parseInt(t.value);
            if (!isNaN(circledNum)) {
                if (circledNum > 21) return { style: '①', value: String(circledNum - 1) };
                if (circledNum === 21) return { style: '①', value: '⑳' };
            }
            const circledIndex = circledNumbers.indexOf(t.value);
            if (circledIndex > 0) return { style: '①', value: circledNumbers[circledIndex - 1] };
            return { style: '①', value: '⓪' };
    }
    return { style: '1', value: t.value - 1 };
}

function printableNumberingToken(t: NumberingToken): string {
    if (t.style === '1') return t.value.toString();
    return t.value;
}

export function makeNumberingString(numberingStack: NumberingToken[], separators: string[]): string {
    let numberingString = '';
    for (let i = 0; i < numberingStack.length; i++) {
        if (i === 0) {
            numberingString += ' '; // Space before H1
        } else {
            // Separator for this level
            // separators index 0 is for H1, so i=1 uses separators[1] which is correct per enhanced logical
            // Actually, enhanced JS uses: separators[i] || ''
            // DEFAULT_SETTINGS.headingSeparators: [ '', '-', ':', '.', '—', '-' ]
            // if i=1 (H2), uses separators[1] ('-')
            numberingString += separators[i] || '';
        }
        numberingString += printableNumberingToken(numberingStack[i]);
    }
    return numberingString;
}
