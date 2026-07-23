// Settings type definitions for Note Assistant

export type NumberingModule = 'headings' | 'formulas';

export interface ManagedNumberRecord {
    elementHash: string;
    token: string;
    configSignature: string;
    level?: number;
    leadingSpace?: boolean;
}

export interface NumberingOwnershipStore {
    version: 1;
    headings: Record<string, ManagedNumberRecord[]>;
    formulas: Record<string, ManagedNumberRecord[]>;
}

export interface NoteAssistantSettings {
    dataVersion: 2;
    myHeadings: MyHeadingsSettings;
    myFormulas: MyFormulasSettings;
    refreshInterval: number;
    ownership: NumberingOwnershipStore;
}

export interface MyHeadingsSettings {
    // Global module switch and default automatic behavior.
    enabled: boolean;
    auto: boolean;
    firstLevel: number;
    maxLevel: number;
    headingStyles: string[];
    headingSeparators: string[];
    headingStartValues: string[];
    skipHeadings: string;

    // Heading Shifter
    limitHeadingFrom: number;
    overrideTab: boolean;
    styleToRemove: {
        beginning: {
            ul: boolean;
            ol: boolean;
            userDefined: string[];
        };
        surrounding: {
            bold: boolean;
            italic: boolean;
            userDefined: string[];
        };
    };
    list: {
        childrenBehavior: 'outdent to zero' | 'sync with headings' | 'noting';
    };
}

export const DEFAULT_MY_HEADINGS_SETTINGS: MyHeadingsSettings = {
    enabled: true,
    auto: false,
    firstLevel: 1,
    maxLevel: 6,
    headingStyles: ['1', 'a', 'A', '一', '①', '1'],
    headingSeparators: ['', '-', ':', '.', '—', '-'],
    headingStartValues: ['0', '1', '1', '1', '1', '1'],
    skipHeadings: '',
    limitHeadingFrom: 1,
    overrideTab: false,
    styleToRemove: {
        beginning: { ul: true, ol: true, userDefined: [] },
        surrounding: { bold: true, italic: true, userDefined: [] },
    },
    list: { childrenBehavior: 'outdent to zero' },
};

export interface MyFormulasSettings {
    enabled: boolean;
    auto: boolean;
    mode: 'continuous' | 'heading-based';
    maxDepth: number;
}

export const DEFAULT_MY_FORMULAS_SETTINGS: MyFormulasSettings = {
    enabled: true,
    auto: false,
    mode: 'continuous',
    maxDepth: 4,
};

export const DEFAULT_OWNERSHIP_STORE: NumberingOwnershipStore = {
    version: 1,
    headings: {},
    formulas: {},
};

export const DEFAULT_SETTINGS: NoteAssistantSettings = {
    dataVersion: 2,
    myHeadings: DEFAULT_MY_HEADINGS_SETTINGS,
    myFormulas: DEFAULT_MY_FORMULAS_SETTINGS,
    refreshInterval: 1000,
    ownership: DEFAULT_OWNERSHIP_STORE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
        ? value
        : fallback;
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown, fallback: string[], length?: number): string[] {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return [...fallback];
    if (length !== undefined && value.length !== length) return [...fallback];
    return [...value];
}

function normalizeManagedRecords(value: unknown): Record<string, ManagedNumberRecord[]> {
    if (!isRecord(value)) return {};
    const result: Record<string, ManagedNumberRecord[]> = {};
    for (const [path, candidate] of Object.entries(value)) {
        if (!Array.isArray(candidate)) continue;
        const records: ManagedNumberRecord[] = [];
        for (const raw of candidate) {
            if (!isRecord(raw)) continue;
            if (typeof raw.elementHash !== 'string' || typeof raw.token !== 'string' || typeof raw.configSignature !== 'string') continue;
            records.push({
                elementHash: raw.elementHash,
                token: raw.token,
                configSignature: raw.configSignature,
                level: typeof raw.level === 'number' ? raw.level : undefined,
                leadingSpace: typeof raw.leadingSpace === 'boolean' ? raw.leadingSpace : undefined,
            });
        }
        if (records.length > 0) result[path] = records;
    }
    return result;
}

export function normalizeSettings(value: unknown): NoteAssistantSettings {
    const root = isRecord(value) ? value : {};
    const rawHeadings = isRecord(root.myHeadings) ? root.myHeadings : {};
    const rawFormulas = isRecord(root.myFormulas) ? root.myFormulas : {};
    const rawStyle = isRecord(rawHeadings.styleToRemove) ? rawHeadings.styleToRemove : {};
    const rawBeginning = isRecord(rawStyle.beginning) ? rawStyle.beginning : {};
    const rawSurrounding = isRecord(rawStyle.surrounding) ? rawStyle.surrounding : {};
    const rawList = isRecord(rawHeadings.list) ? rawHeadings.list : {};
    const childrenBehavior = rawList.childrenBehavior;
    const normalizedChildrenBehavior = childrenBehavior === 'sync with headings' || childrenBehavior === 'noting' || childrenBehavior === 'outdent to zero'
        ? childrenBehavior
        : DEFAULT_MY_HEADINGS_SETTINGS.list.childrenBehavior;

    const myHeadings: MyHeadingsSettings = {
        enabled: booleanValue(rawHeadings.enabled, DEFAULT_MY_HEADINGS_SETTINGS.enabled),
        auto: booleanValue(rawHeadings.auto, DEFAULT_MY_HEADINGS_SETTINGS.auto),
        firstLevel: boundedInteger(rawHeadings.firstLevel, DEFAULT_MY_HEADINGS_SETTINGS.firstLevel, 1, 6),
        maxLevel: boundedInteger(rawHeadings.maxLevel, DEFAULT_MY_HEADINGS_SETTINGS.maxLevel, 1, 6),
        headingStyles: stringArray(rawHeadings.headingStyles, DEFAULT_MY_HEADINGS_SETTINGS.headingStyles, 6),
        headingSeparators: stringArray(rawHeadings.headingSeparators, DEFAULT_MY_HEADINGS_SETTINGS.headingSeparators, 6),
        headingStartValues: stringArray(rawHeadings.headingStartValues, DEFAULT_MY_HEADINGS_SETTINGS.headingStartValues, 6),
        skipHeadings: stringValue(rawHeadings.skipHeadings, DEFAULT_MY_HEADINGS_SETTINGS.skipHeadings),
        limitHeadingFrom: boundedInteger(rawHeadings.limitHeadingFrom, DEFAULT_MY_HEADINGS_SETTINGS.limitHeadingFrom, 0, 6),
        overrideTab: booleanValue(rawHeadings.overrideTab, DEFAULT_MY_HEADINGS_SETTINGS.overrideTab),
        styleToRemove: {
            beginning: {
                ul: booleanValue(rawBeginning.ul, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.beginning.ul),
                ol: booleanValue(rawBeginning.ol, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.beginning.ol),
                userDefined: stringArray(rawBeginning.userDefined, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.beginning.userDefined),
            },
            surrounding: {
                bold: booleanValue(rawSurrounding.bold, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.surrounding.bold),
                italic: booleanValue(rawSurrounding.italic, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.surrounding.italic),
                userDefined: stringArray(rawSurrounding.userDefined, DEFAULT_MY_HEADINGS_SETTINGS.styleToRemove.surrounding.userDefined),
            },
        },
        list: { childrenBehavior: normalizedChildrenBehavior },
    };

    const allowedStyles = new Set(['1', 'a', 'A', 'I', '一', '①']);
    myHeadings.headingStyles = myHeadings.headingStyles.map((style, index) =>
        allowedStyles.has(style) ? style : DEFAULT_MY_HEADINGS_SETTINGS.headingStyles[index],
    );
    myHeadings.headingSeparators = myHeadings.headingSeparators.map((separator, index) =>
        separator.length <= 1 ? separator : DEFAULT_MY_HEADINGS_SETTINGS.headingSeparators[index],
    );
    myHeadings.headingStartValues = myHeadings.headingStartValues.map((value, index) =>
        value.length > 0 ? value : DEFAULT_MY_HEADINGS_SETTINGS.headingStartValues[index],
    );

    if (myHeadings.firstLevel > myHeadings.maxLevel) {
        myHeadings.maxLevel = myHeadings.firstLevel;
    }

    const myFormulas: MyFormulasSettings = {
        enabled: booleanValue(rawFormulas.enabled, DEFAULT_MY_FORMULAS_SETTINGS.enabled),
        auto: booleanValue(rawFormulas.auto, DEFAULT_MY_FORMULAS_SETTINGS.auto),
        mode: rawFormulas.mode === 'heading-based' ? 'heading-based' : 'continuous',
        maxDepth: boundedInteger(rawFormulas.maxDepth, DEFAULT_MY_FORMULAS_SETTINGS.maxDepth, 1, 6),
    };

    const rawOwnership = isRecord(root.ownership) ? root.ownership : {};
    return {
        dataVersion: 2,
        myHeadings,
        myFormulas,
        refreshInterval: boundedInteger(root.refreshInterval, DEFAULT_SETTINGS.refreshInterval, 100, 60000),
        ownership: {
            version: 1,
            headings: normalizeManagedRecords(rawOwnership.headings),
            formulas: normalizeManagedRecords(rawOwnership.formulas),
        },
    };
}
