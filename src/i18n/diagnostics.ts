import { FrontMatterDiagnostic, FrontMatterValidationError } from '../utils/frontmatter';
import { t, TranslationKey } from './helpers';

const diagnosticKeys: Record<FrontMatterDiagnostic['code'], TranslationKey> = {
    conflictingPolicies: 'diagnostic.conflictingPolicies',
    headingPropertyMustBeText: 'diagnostic.headingPropertyMustBeText',
    headingPropertyEmpty: 'diagnostic.headingPropertyEmpty',
    headingRangeAscending: 'diagnostic.headingRangeAscending',
    unsupportedHeadingTokens: 'diagnostic.unsupportedHeadingTokens',
    formulaPropertyMustBeText: 'diagnostic.formulaPropertyMustBeText',
    formulaPropertyEmpty: 'diagnostic.formulaPropertyEmpty',
    unsupportedFormulaTokens: 'diagnostic.unsupportedFormulaTokens',
    headingRangeInvalid: 'diagnostic.headingRangeInvalid',
    headingStylesInvalid: 'diagnostic.headingStylesInvalid',
    headingSeparatorsInvalid: 'diagnostic.headingSeparatorsInvalid',
    headingStartValuesInvalid: 'diagnostic.headingStartValuesInvalid',
    headingSkipContainsComma: 'diagnostic.headingSkipContainsComma',
};

export function formatFrontMatterDiagnostic(diagnostic: FrontMatterDiagnostic): string {
    return t(diagnosticKeys[diagnostic.code], diagnostic.params);
}

export function formatFrontMatterDiagnostics(diagnostics: FrontMatterDiagnostic[]): string {
    return diagnostics.map(formatFrontMatterDiagnostic).join('; ');
}

export function formatSaveError(summaryKey: TranslationKey, error: unknown): string {
    if (error instanceof FrontMatterValidationError) return formatFrontMatterDiagnostic(error.diagnostic);
    const summary = t(summaryKey);
    return error instanceof Error && error.message ? `${summary}: ${error.message}` : summary;
}
