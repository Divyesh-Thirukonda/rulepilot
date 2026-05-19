import { describe, expect, it } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import type { ClassificationResult } from '../shared/types';
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
    const result = calibrateLlmResult(
      llmResult({
        ruleId: 'ai-llms',
        confidence: 0.88,
        rationale: 'This looks AI-generated.',
        matchedSignals: ['authorship guess'],
      }),
      CS_MAJORS_PRESET
    );

    expect(result.decision).toBe('insufficient_context');
    expect(result.suggestedAction).toBe('log');
  });
});
