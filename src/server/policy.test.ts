import { describe, expect, it } from 'vitest';

import { CS_MAJORS_RULES, DEFAULT_ENABLED_RULE_IDS } from '../shared/rules';
import type { ClassificationResult, RulePilotSettings } from '../shared/types';
import { enabledRules, shouldAct } from './policy';

const settings: RulePilotSettings = {
  scanMode: 'filter',
  llmEnabled: false,
  openAiModel: 'gpt-5-nano',
  confidenceThreshold: 0.76,
  timezone: 'America/Chicago',
  enabledRuleIds: DEFAULT_ENABLED_RULE_IDS,
};

function result(confidence: number): ClassificationResult {
  return {
    decision: 'violation',
    ruleId: 'resume-sticky',
    confidence,
    rationale: 'Resume review.',
    suggestedAction: 'filter_to_modqueue',
    source: 'deterministic',
    matchedSignals: ['resume'],
  };
}

describe('policy', () => {
  it('loads enabled preset rules', () => {
    expect(enabledRules(settings)).toHaveLength(CS_MAJORS_RULES.length);
  });

  it('requires both global and rule-specific thresholds before action', () => {
    const lowerGlobal: RulePilotSettings = { ...settings, confidenceThreshold: 0.6 };
    expect(shouldAct(result(0.69), settings, enabledRules(settings))).toBe(false);
    expect(shouldAct(result(0.71), lowerGlobal, enabledRules(lowerGlobal))).toBe(true);
    expect(shouldAct(result(0.77), settings, enabledRules(settings))).toBe(true);
  });

  it('does not act on allowed decisions', () => {
    expect(
      shouldAct(
        {
          ...result(0.99),
          decision: 'allowed',
          suggestedAction: 'allow',
        },
        settings,
        enabledRules(settings)
      )
    ).toBe(false);
  });
});
