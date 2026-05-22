import { afterEach, describe, expect, it, vi } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import { classifyWithOpenAI, parseOpenAIClassificationResponse } from './openai';
import { buildOpenAIClassificationInput } from './openai';

afterEach(() => {
  vi.restoreAllMocks();
});

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
        evidence: [
          { field: 'title', excerpt: 'salary negotiation', note: 'Career-only topic' },
        ],
        actionReason: 'Career-only post matched out-of-scope rule.',
      }),
    });

    expect(result).toMatchObject({
      source: 'llm',
      ruleId: 'out-of-scope',
      confidence: 0.91,
      actionReason: 'Career-only post matched out-of-scope rule.',
      evidence: [
        { field: 'title', excerpt: 'salary negotiation', note: 'Career-only topic' },
      ],
    });
  });

  it('derives matched signals from structured evidence when bullets are empty', () => {
    const result = parseOpenAIClassificationResponse({
      output_text: JSON.stringify({
        decision: 'needs_review',
        ruleId: 'low-quality',
        confidence: 0.62,
        rationale: 'The post has too little context.',
        suggestedAction: 'flag_for_review',
        matchedSignals: [],
        evidence: [
          { field: 'quality', excerpt: null, note: 'Title-only question with no body context' },
        ],
        actionReason: 'Low-context post needs moderator review.',
      }),
    });

    expect(result.matchedSignals).toEqual(['quality: Title-only question with no body context']);
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
        evidence: [],
        actionReason: 'Insufficient context.',
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
        totalWordCount: 13,
      },
    });
    expect(payload.enabledRules).toHaveLength(2);
    expect(payload).toMatchObject({
      outputContract: {
        ruleId: 'one enabled rule id or null',
      },
    });
    expect(payload.deterministicPrechecks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'out-of-scope',
        hasSemanticConditions: true,
        deterministicPreconditionsPass: true,
      }),
    ]));
  });

  it('sends dynamic rule-id schema, rule action metadata, and prechecks to OpenAI', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      output_text: JSON.stringify({
        decision: 'needs_review',
        ruleId: 'out-of-scope',
        confidence: 0.72,
        rationale: 'General college signal needs moderator review.',
        suggestedAction: 'flag_for_review',
        matchedSignals: ['general college signal'],
        evidence: [
          { field: 'title', excerpt: 'dorm choice', note: 'General college topic' },
        ],
        actionReason: 'General college post may be out of scope.',
      }),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await classifyWithOpenAI({
      post: {
        id: 't3_demo',
        title: 'Which dorm choice is better?',
        body: '',
        subredditName: 'csMajors',
        createdAt: new Date('2026-05-18T17:00:00.000Z'),
      },
      rules: CS_MAJORS_PRESET.slice(0, 1),
      apiKey: 'test-key',
      model: 'gpt-5-nano',
      timezone: 'America/Chicago',
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(requestInit?.body as string);
    const userPayload = JSON.parse(body.input[1].content);

    expect(body.text.format.schema.properties.ruleId.anyOf[0].enum).toEqual(['out-of-scope']);
    expect(userPayload.enabledRules[0]).toMatchObject({
      id: 'out-of-scope',
      suggestedActionForViolation: 'filter_to_modqueue',
    });
    expect(userPayload.deterministicPrechecks[0]).toMatchObject({
      ruleId: 'out-of-scope',
      hasSemanticConditions: true,
      deterministicPreconditionsPass: true,
    });
    expect(userPayload.outputContract).toMatchObject({
      evidence: '0-5 visible evidence objects with field, excerpt, and note',
    });
  });
});
