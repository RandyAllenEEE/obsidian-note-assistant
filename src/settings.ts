// Settings type definitions for Note Assistant

// ====================================================================================
// Main Settings Interface
// ====================================================================================

export interface NoteAssistantSettings {
    myHeadings: MyHeadingsSettings;
    myFormulas: MyFormulasSettings;
    refreshInterval?: number; // Global auto-numbering refresh interval
}

export const DEFAULT_SETTINGS: NoteAssistantSettings = {
    myHeadings: null as any, // Initialized below
    myFormulas: null as any,
    refreshInterval: 1000,
};

// ====================================================================================
// MyHeadings Settings
// ====================================================================================

export interface MyHeadingsSettings {
    // Auto Numbering
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
        childrenBehavior: "outdent to zero" | "sync with headings" | "noting";
    };
    editor: {
        tabSize: number;
    };
}

export const DEFAULT_MY_HEADINGS_SETTINGS: MyHeadingsSettings = {
    // Auto Numbering
    enabled: true,
    auto: false,
    firstLevel: 1,
    maxLevel: 6,
    headingStyles: ['1', 'a', 'A', '一', '①', '1'],
    headingSeparators: ['', '-', ':', '.', '—', '-'],
    headingStartValues: ['0', '1', '1', '1', '1', '1'],
    skipHeadings: '',

    // Heading Shifter
    limitHeadingFrom: 1,
    overrideTab: false,
    styleToRemove: {
        beginning: {
            ul: true,
            ol: true,
            userDefined: [],
        },
        surrounding: {
            bold: true,
            italic: true,
            userDefined: [],
        },
    },
    list: {
        childrenBehavior: "outdent to zero",
    },
    editor: {
        tabSize: 4,
    },
};

// ====================================================================================
// MyFormulas Settings
// ====================================================================================

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
    maxDepth: 4
};

// Initialize the main settings object with defaults
DEFAULT_SETTINGS.myHeadings = DEFAULT_MY_HEADINGS_SETTINGS;
DEFAULT_SETTINGS.myFormulas = DEFAULT_MY_FORMULAS_SETTINGS;
