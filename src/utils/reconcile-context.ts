import type { MyFormulasSettings, MyHeadingsSettings } from "../settings";

export type ReconcileTrigger =
    | "auto-blur"
    | "explicit-apply"
    | "config-change";

export type HeadingNumberingConfig = Pick<
    MyHeadingsSettings,
    "firstLevel" | "maxLevel" | "headingStyles" | "headingSeparators" | "headingStartValues" | "skipHeadings"
>;

export type FormulaNumberingConfig = Pick<MyFormulasSettings, "mode" | "maxDepth">;

export interface ReconcileContext {
    trigger: ReconcileTrigger;
    acceptedHeadingConfigs?: HeadingNumberingConfig[];
    acceptedFormulaConfigs?: FormulaNumberingConfig[];
}

export const DEFAULT_RECONCILE_CONTEXT: ReconcileContext = {
    trigger: "auto-blur",
};

export function snapshotHeadingNumberingConfig(settings: HeadingNumberingConfig): HeadingNumberingConfig {
    return {
        firstLevel: settings.firstLevel,
        maxLevel: settings.maxLevel,
        headingStyles: [...settings.headingStyles],
        headingSeparators: [...settings.headingSeparators],
        headingStartValues: [...settings.headingStartValues],
        skipHeadings: settings.skipHeadings,
    };
}

export function snapshotFormulaNumberingConfig(settings: FormulaNumberingConfig): FormulaNumberingConfig {
    return { mode: settings.mode, maxDepth: settings.maxDepth };
}
