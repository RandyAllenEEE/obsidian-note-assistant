import { App, FrontMatterCache, parseFrontMatterEntry, TFile } from 'obsidian';
import {
    DEFAULT_MY_FORMULAS_SETTINGS,
    DEFAULT_MY_HEADINGS_SETTINGS,
    MyFormulasSettings,
    MyHeadingsSettings,
} from '../settings';

export type FileNumberingPolicy = 'manual' | 'auto' | 'none' | 'off' | 'invalid';
export type ReconcileIntent = 'number' | 'clear';

export type FrontMatterDiagnosticCode =
    | 'conflictingPolicies'
    | 'headingPropertyMustBeText'
    | 'headingPropertyEmpty'
    | 'headingRangeAscending'
    | 'unsupportedHeadingTokens'
    | 'formulaPropertyMustBeText'
    | 'formulaPropertyEmpty'
    | 'unsupportedFormulaTokens'
    | 'headingRangeInvalid'
    | 'headingStylesInvalid'
    | 'headingSeparatorsInvalid'
    | 'headingStartValuesInvalid'
    | 'headingSkipContainsComma';

export interface FrontMatterDiagnostic {
    code: FrontMatterDiagnosticCode;
    params?: Record<string, string | number>;
}

export class FrontMatterValidationError extends Error {
    readonly diagnostic: FrontMatterDiagnostic;

    constructor(diagnostic: FrontMatterDiagnostic) {
        super(diagnostic.code);
        this.name = 'FrontMatterValidationError';
        this.diagnostic = diagnostic;
    }
}

export function resolveReconcileIntent(
    globalEnabled: boolean,
    policy: FileNumberingPolicy,
    explicitIntent?: ReconcileIntent,
): ReconcileIntent | undefined {
    if (!globalEnabled || policy === 'off' || policy === 'invalid') return undefined;
    if (explicitIntent) return explicitIntent;
    if (policy === 'auto') return 'number';
    if (policy === 'none') return 'clear';
    return undefined;
}

export interface ParsedNumberingFrontMatter<T> {
    policy: FileNumberingPolicy;
    settings: T;
    rawValue?: string;
    errors: FrontMatterDiagnostic[];
    inherited: boolean;
    unsupportedTokens?: string[];
}

export type ParsedHeadingsFrontMatter = ParsedNumberingFrontMatter<MyHeadingsSettings>;
export type ParsedFormulasFrontMatter = ParsedNumberingFrontMatter<MyFormulasSettings>;

export interface FrontMatterNumberingValue<T> {
    settings: T;
    policy: Exclude<FileNumberingPolicy, 'invalid'>;
    unsupportedTokens?: string[];
    rawValue?: string;
    preserveTail?: boolean;
}

const POLICY_TOKENS = new Set(['auto', 'none', 'off']);
const HEADING_STYLES = new Set(['1', 'a', 'A', 'I', '一', '①']);

function cloneHeadings(settings: MyHeadingsSettings): MyHeadingsSettings {
    return {
        ...settings,
        headingStyles: [...settings.headingStyles],
        headingSeparators: [...settings.headingSeparators],
        headingStartValues: [...settings.headingStartValues],
        styleToRemove: {
            beginning: { ...settings.styleToRemove.beginning, userDefined: [...settings.styleToRemove.beginning.userDefined] },
            surrounding: { ...settings.styleToRemove.surrounding, userDefined: [...settings.styleToRemove.surrounding.userDefined] },
        },
        list: { ...settings.list },
    };
}

function cloneFormulas(settings: MyFormulasSettings): MyFormulasSettings {
    return { ...settings };
}

function getEntry(fm: FrontMatterCache | undefined, key: string): { present: boolean; value?: unknown } {
    if (!fm || !Object.prototype.hasOwnProperty.call(fm, key)) return { present: false };
    return { present: true, value: parseFrontMatterEntry(fm, key) };
}

function parsePolicy(parts: string[], inheritedAuto: boolean, present: boolean): { policy: FileNumberingPolicy; errors: FrontMatterDiagnostic[] } {
    if (!present) return { policy: inheritedAuto ? 'auto' : 'manual', errors: [] };
    const states = parts.filter(part => POLICY_TOKENS.has(part));
    if (states.length > 1) return { policy: 'invalid', errors: [{ code: 'conflictingPolicies' }] };
    if (states.length === 1) return { policy: states[0] as 'auto' | 'none' | 'off', errors: [] };
    return { policy: 'manual', errors: [] };
}

function invalidResult<T>(settings: T, rawValue: string | undefined, errors: FrontMatterDiagnostic[], unsupportedTokens?: string[]): ParsedNumberingFrontMatter<T> {
    return { policy: 'invalid', settings, rawValue, errors, inherited: false, unsupportedTokens };
}

export function parseHeadingsFrontMatterValue(
    value: unknown,
    defaultSettings: MyHeadingsSettings,
    present = true,
): ParsedHeadingsFrontMatter {
    const settings = cloneHeadings(defaultSettings);
    if (!present) {
        return {
            policy: settings.auto ? 'auto' : 'manual',
            settings,
            errors: [],
            inherited: true,
        };
    }
    if (typeof value !== 'string') return invalidResult(settings, undefined, [{ code: 'headingPropertyMustBeText' }]);

    const rawValue = value;
    const parts = value.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return invalidResult(settings, rawValue, [{ code: 'headingPropertyEmpty' }]);
    const policyResult = parsePolicy(parts, settings.auto, true);
    if (policyResult.policy === 'invalid') return invalidResult(settings, rawValue, policyResult.errors);

    let rangeFound = false;
    let stylesFound = false;
    let separatorsFound = false;
    let startValuesFound = false;
    const unknown: string[] = [];

    for (const part of parts) {
        if (POLICY_TOKENS.has(part)) continue;
        const rangeMatch = part.match(/^([1-6])-([1-6])$/);
        if (!rangeFound && rangeMatch) {
            const first = Number(rangeMatch[1]);
            const max = Number(rangeMatch[2]);
            if (first > max) return invalidResult(settings, rawValue, [{ code: 'headingRangeAscending' }]);
            settings.firstLevel = first;
            settings.maxLevel = max;
            rangeFound = true;
            continue;
        }
        const firstMatch = part.match(/^first-level(?:\s*[:=-]?\s*)([1-6])$/);
        if (firstMatch) {
            settings.firstLevel = Number(firstMatch[1]);
            rangeFound = true;
            continue;
        }
        const maxMatch = part.match(/^max(?:\s*[:=-]?\s*)([1-6])$/);
        if (maxMatch) {
            settings.maxLevel = Number(maxMatch[1]);
            rangeFound = true;
            continue;
        }
        if (!stylesFound && part.length === 6 && [...part].every(style => HEADING_STYLES.has(style))) {
            settings.headingStyles = [...part];
            stylesFound = true;
            continue;
        }
        if (!startValuesFound && /^\d{6}$/.test(part)) {
            settings.headingStartValues = [...part];
            startValuesFound = true;
            continue;
        }
        if (!separatorsFound && /^[-:.\u2014]{5}$/.test(part)) {
            settings.headingSeparators = ['', ...part];
            separatorsFound = true;
            continue;
        }
        if (part.startsWith('skip=')) {
            settings.skipHeadings = part.slice('skip='.length);
            continue;
        }
        unknown.push(part);
    }

    if (settings.firstLevel > settings.maxLevel) return invalidResult(settings, rawValue, [{ code: 'headingRangeAscending' }]);
    if (unknown.length > 0) {
        return invalidResult(
            settings,
            rawValue,
            [{ code: 'unsupportedHeadingTokens', params: { tokens: unknown.join(', ') } }],
            unknown,
        );
    }
    settings.auto = policyResult.policy === 'auto';
    return {
        policy: policyResult.policy,
        settings,
        rawValue,
        errors: [],
        inherited: false,
    };
}

export function parseHeadingsFrontMatter(
    fm: FrontMatterCache | undefined,
    defaultSettings: MyHeadingsSettings,
): ParsedHeadingsFrontMatter {
    const entry = getEntry(fm, 'number headings');
    return parseHeadingsFrontMatterValue(entry.value, defaultSettings, entry.present);
}

function validateHeadingsForSerialization(settings: MyHeadingsSettings): void {
    if (settings.firstLevel < 1 || settings.maxLevel > 6 || settings.firstLevel > settings.maxLevel) {
        throw new FrontMatterValidationError({ code: 'headingRangeInvalid' });
    }
    if (settings.headingStyles.length !== 6 || settings.headingStyles.some(style => !HEADING_STYLES.has(style))) {
        throw new FrontMatterValidationError({ code: 'headingStylesInvalid' });
    }
    if (settings.headingSeparators.length !== 6 || settings.headingSeparators.slice(1).some(separator => !/^[-:.\u2014]$/.test(separator))) {
        throw new FrontMatterValidationError({ code: 'headingSeparatorsInvalid' });
    }
    if (settings.headingStartValues.length !== 6 || settings.headingStartValues.some(value => !/^\d$/.test(value))) {
        throw new FrontMatterValidationError({ code: 'headingStartValuesInvalid' });
    }
    if (settings.skipHeadings.includes(',')) throw new FrontMatterValidationError({ code: 'headingSkipContainsComma' });
}

export function serializeHeadingsFrontMatter(
    settings: MyHeadingsSettings,
    policy: Exclude<FileNumberingPolicy, 'invalid'> = settings.auto ? 'auto' : 'manual',
    unsupportedTokens: string[] = [],
): string {
    validateHeadingsForSerialization(settings);
    const parts: string[] = [];
    if (policy !== 'manual') parts.push(policy);
    parts.push(`${settings.firstLevel}-${settings.maxLevel}`);
    parts.push(settings.headingStyles.join(''));
    parts.push(settings.headingSeparators.slice(1, 6).join(''));
    parts.push(settings.headingStartValues.join(''));
    if (settings.skipHeadings) parts.push(`skip=${settings.skipHeadings}`);
    parts.push(...unsupportedTokens);
    return parts.join(', ');
}

export function parseFormulasFrontMatterValue(
    value: unknown,
    defaultSettings: MyFormulasSettings,
    present = true,
): ParsedFormulasFrontMatter {
    const settings = cloneFormulas(defaultSettings);
    if (!present) {
        return {
            policy: settings.auto ? 'auto' : 'manual',
            settings,
            errors: [],
            inherited: true,
        };
    }
    if (typeof value !== 'string') return invalidResult(settings, undefined, [{ code: 'formulaPropertyMustBeText' }]);

    const rawValue = value;
    const parts = value.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return invalidResult(settings, rawValue, [{ code: 'formulaPropertyEmpty' }]);
    const policyResult = parsePolicy(parts, settings.auto, true);
    if (policyResult.policy === 'invalid') return invalidResult(settings, rawValue, policyResult.errors);

    let modeFound = false;
    const unknown: string[] = [];
    for (const part of parts) {
        if (POLICY_TOKENS.has(part)) continue;
        if (!modeFound && part === 'continuous') {
            settings.mode = 'continuous';
            modeFound = true;
            continue;
        }
        const headingMatch = part.match(/^heading-based(?:\(([1-6])\))?$/);
        if (!modeFound && headingMatch) {
            settings.mode = 'heading-based';
            if (headingMatch[1]) settings.maxDepth = Number(headingMatch[1]);
            modeFound = true;
            continue;
        }
        unknown.push(part);
    }
    if (unknown.length > 0) {
        return invalidResult(
            settings,
            rawValue,
            [{ code: 'unsupportedFormulaTokens', params: { tokens: unknown.join(', ') } }],
            unknown,
        );
    }
    settings.auto = policyResult.policy === 'auto';
    return {
        policy: policyResult.policy,
        settings,
        rawValue,
        errors: [],
        inherited: false,
    };
}

export function parseFormulasFrontMatter(
    fm: FrontMatterCache | undefined,
    defaultSettings: MyFormulasSettings,
): ParsedFormulasFrontMatter {
    const entry = getEntry(fm, 'number formulas');
    return parseFormulasFrontMatterValue(entry.value, defaultSettings, entry.present);
}

export function serializeFormulasFrontMatter(
    settings: MyFormulasSettings,
    policy: Exclude<FileNumberingPolicy, 'invalid'> = settings.auto ? 'auto' : 'manual',
    unsupportedTokens: string[] = [],
): string {
    const parts: string[] = [];
    if (policy !== 'manual') parts.push(policy);
    parts.push(settings.mode === 'heading-based' ? `heading-based(${settings.maxDepth})` : 'continuous');
    parts.push(...unsupportedTokens);
    return parts.join(', ');
}

export function replaceFrontMatterPolicy(
    rawValue: string | undefined,
    policy: Exclude<FileNumberingPolicy, 'invalid'>,
): string | undefined {
    if (rawValue === undefined) return undefined;
    const tail = rawValue.split(',').filter(part => !POLICY_TOKENS.has(part.trim()));
    if (policy === 'manual') return tail.join(',').trim();
    const suffix = tail.length > 0
        ? `,${/^\s/.test(tail[0]) ? '' : ' '}${tail.join(',')}`
        : '';
    return `${policy}${suffix}`;
}

export async function saveSettingsToFrontMatter(
    app: App,
    file: TFile,
    headings?: FrontMatterNumberingValue<MyHeadingsSettings>,
    formulas?: FrontMatterNumberingValue<MyFormulasSettings>,
): Promise<void> {
    await app.fileManager.processFrontMatter(file, fm => {
        if (headings) {
            fm['number headings'] = headings.preserveTail && headings.rawValue !== undefined
                ? replaceFrontMatterPolicy(headings.rawValue, headings.policy)
                : serializeHeadingsFrontMatter(headings.settings, headings.policy, headings.unsupportedTokens);
        }
        if (formulas) {
            fm['number formulas'] = formulas.preserveTail && formulas.rawValue !== undefined
                ? replaceFrontMatterPolicy(formulas.rawValue, formulas.policy)
                : serializeFormulasFrontMatter(formulas.settings, formulas.policy, formulas.unsupportedTokens);
        }
    });
}

export function defaultHeadingsFrontMatter(): ParsedHeadingsFrontMatter {
    return parseHeadingsFrontMatterValue(undefined, DEFAULT_MY_HEADINGS_SETTINGS, false);
}

export function defaultFormulasFrontMatter(): ParsedFormulasFrontMatter {
    return parseFormulasFrontMatterValue(undefined, DEFAULT_MY_FORMULAS_SETTINGS, false);
}
