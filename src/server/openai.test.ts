import { describe, expect, it } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import { parseOpenAIClassificationResponse } from './openai';
import { buildOpenAIClassificationInput } from './openai';

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

  it('parses insufficient_context as a first-class outcome', () => {
    const result = parseOpenAIClassificationResponse({
      output_text: JSON.stringify({
        decision: 'insufficient_context',
        ruleId: null,
        confidence: 0.38,
        rationale: 'Not enough post context to classify a violation.',
        suggestedAction: 'log',
        matchedSignals: ['title is ambiguous'],
      }),
    });

    expect(result.decision).toBe('insufficient_context');
    expect(result.suggestedAction).toBe('log');
  });

  it('builds an enriched bounded feature payload', () => {
    const payload = buildOpenAIClassificationInput({
      post: {
        id: 't3_demo',
        title: 'Need help choosing between two laptops?',
        body: 'MacBook or ThinkPad for first year CS?',
        flairText: 'Question',
        url: 'https://example.com/list',
        postType: 'link',
        subredditName: 'csMajors',
        createdAt: new Date('2026-05-18T17:00:00.000Z'),
      },
      rules: CS_MAJORS_PRESET.slice(0, 2),
      timezone: 'America/Chicago',
    });

    expect(payload).toMatchObject({
      task: 'Classify this post against enabled subreddit rules only.',
    });
    expect(payload.post).toMatchObject({
      flairText: 'Question',
      urlDomain: 'example.com',
      postType: 'link',
      createdWeekday: 'Monday',
      timezone: 'America/Chicago',
      qualityIndicators: {
        hasQuestionMark: true,
        hasUrl: true,
      },
    });
    expect(payload.enabledRules).toHaveLength(2);
  });
});
