import { CS_MAJORS_PRESET } from '../shared/rules';
import type { ClassificationResult, RuleConfigV2, RulePilotSettings } from '../shared/types';

/** Return enabled rules from the provided V2 rules list. */
export function enabledRulesFromList(rules: RuleConfigV2[]): RuleConfigV2[] {
  return rules.filter((rule) => rule.enabled);
}

/**
 * Legacy helper: return enabled rules from the CS_MAJORS_PRESET based on settings.
 * Used as a fallback when subreddit rules haven't been loaded yet.
 */
export function enabledRules(settings: RulePilotSettings): RuleConfigV2[] {
  const enabled = new Set(settings.enabledRuleIds);
  return CS_MAJORS_PRESET.filter((rule) => enabled.has(rule.id));
}

export function shouldAct(result: ClassificationResult, settings: RulePilotSettings, rules: RuleConfigV2[]): boolean {
  if (
    result.suggestedAction === 'allow' ||
    result.decision === 'allowed' ||
    result.decision === 'insufficient_context'
  ) {
    return false;
  }
  const ruleThreshold = rules.find((rule) => rule.id === result.ruleId)?.threshold ?? settings.confidenceThreshold;
  return result.confidence >= Math.max(settings.confidenceThreshold, ruleThreshold);
}
