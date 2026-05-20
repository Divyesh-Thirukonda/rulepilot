import { describe, expect, it } from 'vitest';

import type { RuleConfigV2 } from '../shared/types';
import { draftRuleWithOpenAI, RuleBuilderGenerationError } from './rule-builder';

const LIVE_PROMPTS = [
  'only allow ragebait posts on sundays if they put a disclaimer at the bottom of the post',
  'no AI slop',
  'require approval for surveys',
  'no live online assessment questions',
  'no low effort title only questions',
];

function validateLiveDraft(intent: string, rule: RuleConfigV2): string | null {
  if (!rule.title.trim()) return 'Generated rule title was empty.';
  if (!rule.description.trim()) return 'Generated rule description was empty.';
  if (rule.enabled) return 'Generated rule must be disabled by default.';
  if (rule.conditions.length === 0) return 'Generated rule had no conditions.';
  const semantic = rule.conditions.find((condition) => condition.type === 'semantic');
  const requiresSemantic = /\b(ai slop|ragebait|satire|live oa|live online assessment|online assessment)\b/i.test(intent);
  if (!semantic && requiresSemantic) {
    return 'Generated rule should include a semantic rubric for ambiguous moderation language.';
  }
  if (semantic && semantic.value.length < 120) return 'Semantic condition was too short to be a useful classifier rubric.';
  return null;
}

const describeLive = process.env.RULEPILOT_RUN_LIVE_OPENAI === '1' ? describe : describe.skip;

describeLive('RulePilot AI Builder live OpenAI smoke', () => {
  it.concurrent.each(LIVE_PROMPTS)('drafts "%s" with the real OpenAI API', async (intent) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Set OPENAI_API_KEY before running npm run test:ai-builder:live.');
    }

    let response;
    try {
      response = await draftRuleWithOpenAI({
        request: {
          mode: 'natural_language',
          intent,
          timezone: 'America/Chicago',
          currentRules: [],
        },
        apiKey,
        model: process.env.RULEPILOT_OPENAI_MODEL ?? 'gpt-5-nano',
        validateDraft: (rule) => validateLiveDraft(intent, rule),
      });
    } catch (error) {
      if (error instanceof RuleBuilderGenerationError) {
        throw new Error(`${error.message}\n${error.details.join('\n')}`);
      }
      throw error;
    }

    expect(response.status, intent).toBe('draft');
    if (response.status === 'draft') {
      const expectsSemantic = /\b(ai slop|ragebait|satire|live oa|live online assessment|online assessment)\b/i.test(intent);
      expect(response.rule.enabled, intent).toBe(false);
      expect(response.rule.conditions.length, intent).toBeGreaterThan(0);
      if (expectsSemantic) {
        expect(response.rule.conditions.some((condition) => condition.type === 'semantic'), intent).toBe(true);
      }
    }
  }, 120_000);
});
