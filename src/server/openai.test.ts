import { describe, expect, it } from 'vitest';

import { parseOpenAIClassificationResponse } from './openai';

describe('parseOpenAIClassificationResponse', () => {
  it('parses Responses API structured output text', () => {
    const result = parseOpenAIClassificationResponse({
      output_text: JSON.stringify({
        decision: 'violation',
        ruleId: 'out-of-scope',
        confidence: 0.91,
        rationale: 'Career-only post.',
        suggestedAction: 'filter_to_modqueue',
        matchedSignals: ['career-only'],
      }),
    });

    expect(result).toMatchObject({
      source: 'llm',
      ruleId: 'out-of-scope',
      confidence: 0.91,
    });
  });

  it('rejects malformed model output', () => {
    expect(() =>
      parseOpenAIClassificationResponse({
        output_text: JSON.stringify({
          ruleId: 'out-of-scope',
          confidence: 2,
        }),
      })
    ).toThrow();
  });
});
