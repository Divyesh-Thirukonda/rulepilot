import { describe, expect, it } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import type { ClassificationResult, RuleConfigV2 } from '../shared/types';
import { calibrateLlmResult } from './classifier';

function llmResult(input: Partial<ClassificationResult>): ClassificationResult {
  return {
    decision: 'violation',
    ruleId: 'out-of-scope',
    confidence: 0.8,
    rationale: 'Likely issue.',
    suggestedAction: 'filter_to_modqueue',
    source: 'llm',
    matchedSignals: ['evidence'],
    ...input,
  };
}

describe('calibrateLlmResult', () => {
  it('downgrades lower-confidence out-of-scope violations to review', () => {
    const result = calibrateLlmResult(
      llmResult({ ruleId: 'out-of-scope', confidence: 0.82 }),
      CS_MAJORS_PRESET
    );

    expect(result.decision).toBe('needs_review');
    expect(result.suggestedAction).toBe('flag_for_review');
    expect(result.confidence).toBeLessThan(0.78);
  });

  it('defaults low-quality LLM violations to needs review', () => {
    const result = calibrateLlmResult(
      llmResult({ ruleId: 'low-quality', confidence: 0.91 }),
      CS_MAJORS_PRESET
    );

    expect(result.decision).toBe('needs_review');
    expect(result.suggestedAction).toBe('flag_for_review');
  });

  it('rejects AI policy matches based only on authorship detection', () => {
    const aiPolicyRule: RuleConfigV2 = {
      id: 'ai-llms',
      title: 'AI Large Language Models',
      description: 'AI policy topic rule.',
      examples: [],
      negativeExamples: [],
      action: 'flag',
      threshold: 0.78,
      category: 'quality',
      enabled: true,
      conditions: [],
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
      source: 'custom',
    };
    const result = calibrateLlmResult(
      llmResult({
        ruleId: 'ai-llms',
        confidence: 0.88,
        rationale: 'This looks AI-generated.',
        matchedSignals: ['authorship guess'],
      }),
      [aiPolicyRule]
    );

    expect(result.decision).toBe('insufficient_context');
    expect(result.suggestedAction).toBe('log');
  });

  it('normalizes LLM suggested action to the matched rule routing action', () => {
    const logOnlyRule: RuleConfigV2 = {
      id: 'log-only-topic',
      title: 'Log-only topic',
      description: 'Record these posts without taking a moderation action.',
      examples: [],
      negativeExamples: [],
      action: 'log',
      threshold: 0.7,
      category: 'quality',
      enabled: true,
      conditions: [],
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z',
      source: 'custom',
    };

    const result = calibrateLlmResult(
      llmResult({
        ruleId: 'log-only-topic',
        suggestedAction: 'filter_to_modqueue',
      }),
      [logOnlyRule]
    );

    expect(result.suggestedAction).toBe('log');
  });
});
