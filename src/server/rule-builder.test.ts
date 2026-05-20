import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRuleBuilderPayload,
  buildTemplateRuleDraft,
  draftRuleWithOpenAI,
  parseRuleBuilderResponse,
  RuleBuilderGenerationError,
} from './rule-builder';

function openAiDraftResponse(draft: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      status: 'draft',
      questions: [],
      draft,
    }),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openAiClarificationResponse(questions: string[]): Response {
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      status: 'needs_clarification',
      questions,
      draft: null,
    }),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Sunday ragebait disclaimer rule',
    description: 'Flag satire or ragebait posts unless the post satisfies the Sunday disclaimer requirement.',
    examples: ['Hot take: this class is fake and everyone should rage in the comments'],
    negativeExamples: ['Serious discussion about satire rules'],
    action: 'flag',
    threshold: 0.76,
    category: 'format',
    conditions: [
      {
        type: 'semantic',
        field: null,
        value:
          'Detect satire or ragebait posts for this rule. Match when the post is satire or ragebait and either it is not Sunday in the subreddit timezone or it lacks a clear disclaimer at the bottom of the body. Do not match sincere discussion, meta discussion about the rule, or Sunday satire/ragebait posts with a visible bottom disclaimer. Evidence cues must come from title, body, flair, URL/domain, post type, and local datetime. If uncertain, choose needs_review.',
        min: null,
        max: null,
        days: [],
        negate: false,
      },
    ],
    redirectTargetType: null,
    redirectTarget: null,
    redirectTemplate: null,
    modNotes: null,
    ...overrides,
  };
}

describe('RulePilot AI Builder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses a valid structured LLM response into a disabled RuleConfigV2 draft', () => {
    const response = parseRuleBuilderResponse({
      output_text: JSON.stringify({
        status: 'draft',
        questions: [],
        draft: {
          title: 'Homework answers require effort',
          description: 'Flag posts asking for direct homework answers without showing an attempt.',
          examples: ['Can someone solve my assignment?', 'Need answer for project 2'],
          negativeExamples: ['Here is my attempt, why is it failing?'],
          action: 'flag',
          threshold: 0.76,
          category: 'quality',
          conditions: [
            {
              type: 'semantic',
              field: null,
              value: 'asking for direct homework answers without showing effort',
              min: null,
              max: null,
              days: [],
              negate: false,
            },
          ],
          redirectTargetType: null,
          redirectTarget: null,
          redirectTemplate: null,
          modNotes: 'Review for false positives around legitimate debugging questions.',
        },
      }),
    });

    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.enabled).toBe(false);
      expect(response.rule.source).toBe('custom');
      expect(response.rule.conditions[0]?.type).toBe('semantic');
      expect(response.rule.modNotes).toContain('false positives');
    }
  });

  it('rejects invalid structured LLM rule fields', () => {
    expect(() =>
      parseRuleBuilderResponse({
        output_text: JSON.stringify({
          status: 'draft',
          questions: [],
          draft: {
            title: 'Bad action',
            description: 'Invalid action should fail.',
            examples: [],
            negativeExamples: [],
            action: 'ban',
            threshold: 0.76,
            category: 'quality',
            conditions: [],
            redirectTargetType: null,
            redirectTarget: null,
            redirectTemplate: null,
            modNotes: null,
          },
        }),
      })
    ).toThrow();
  });

  it('parses clarification questions without a draft', () => {
    const response = parseRuleBuilderResponse({
      output_text: JSON.stringify({
        status: 'needs_clarification',
        questions: ['Should this apply to posts, comments, or both?', 'Should likely matches be flagged or filtered?'],
        draft: null,
      }),
    });

    expect(response).toEqual({
      status: 'needs_clarification',
      questions: ['Should this apply to posts, comments, or both?', 'Should likely matches be flagged or filtered?'],
    });
  });

  it('generates built-in template drafts with expected defaults', () => {
    const meme = buildTemplateRuleDraft('sunday_memes');
    const resume = buildTemplateRuleDraft('resume_megathread');
    const survey = buildTemplateRuleDraft('survey_approval');

    expect(meme.status).toBe('draft');
    expect(resume.status).toBe('draft');
    expect(survey.status).toBe('draft');
    if (meme.status === 'draft' && resume.status === 'draft' && survey.status === 'draft') {
      expect(meme.rule.enabled).toBe(false);
      expect(meme.rule.conditions.some((condition) => condition.type === 'day_of_week' && condition.negate)).toBe(true);
      expect(resume.rule.redirectTargetType).toBe('megathread');
      expect(survey.rule.action).toBe('filter');
      expect(new Set([meme.rule.id, resume.rule.id, survey.rule.id]).size).toBe(3);
    }
  });

  it('expands weak semantic labels into classifier-ready rubrics', () => {
    const response = parseRuleBuilderResponse({
      output_text: JSON.stringify({
        status: 'draft',
        questions: [],
        draft: {
          title: 'No shitposts',
          description: 'Flag posts that are primarily low-effort jokes, bait, or intentionally unserious content.',
          examples: ['me when leetcode dynamic programming', 'CS majors be like'],
          negativeExamples: ['Can someone explain what counts as a shitpost?', 'Serious discussion about humor rules'],
          action: 'flag',
          threshold: 0.72,
          category: 'format',
          conditions: [
            {
              type: 'semantic',
              field: null,
              value: 'shitpost',
              min: null,
              max: null,
              days: [],
              negate: false,
            },
          ],
          redirectTargetType: null,
          redirectTarget: null,
          redirectTemplate: null,
          modNotes: null,
        },
      }),
    });

    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.conditions[0]?.value).toContain('Detect posts for rule "No shitposts"');
      expect(response.rule.conditions[0]?.value).toContain('Do not match when');
      expect(response.rule.conditions[0]?.value).toContain('needs_review');
    }
  });

  it('instructs OpenAI to draft semantic rubrics instead of labels', () => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent: 'No shitposts',
      timezone: 'America/Chicago',
      currentRules: [],
    });

    expect(JSON.stringify(payload)).toContain('Semantic condition values must be classifier-ready rubrics');
    expect(JSON.stringify(payload)).toContain('shitposts');
    expect(JSON.stringify(payload)).toContain('Do not match sincere questions');
  });

  it('generalizes timed disclaimer rule planning beyond Sundays', () => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent: 'only allow ragebait posts on Wednesdays if they put a disclaimer at the bottom of the post',
      timezone: 'America/Chicago',
      currentRules: [],
    });
    const text = JSON.stringify(payload);
    const rulePlanHint = payload.rulePlanHint as { requiredSemanticCondition: string; forbiddenConditionTypes: string[] };

    expect(text).toContain('not Wednesday OR missing disclaimer');
    expect(rulePlanHint.requiredSemanticCondition).toContain('explicitly include "Wednesday" and "disclaimer"');
    expect(text).toContain('Do not add day_of_week as a deterministic condition');
    expect(rulePlanHint.forbiddenConditionTypes).toEqual(expect.arrayContaining(['keyword', 'regex', 'day_of_week']));
  });

  it('does not ask OpenAI to invent regex gates for subjective ragebait rules', () => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent: 'only allow ragebait posts on Wednesdays if they put a disclaimer at the bottom of the post',
      timezone: 'America/Chicago',
      currentRules: [],
    });
    const rulePlanHint = payload.rulePlanHint as { forbiddenConditionTypes: string[]; requiredSemanticCondition: string };

    expect(rulePlanHint.forbiddenConditionTypes).toEqual(expect.arrayContaining(['keyword', 'regex']));
    expect(rulePlanHint.requiredSemanticCondition).toContain('Detect ragebait/satire-like posts');
    expect(JSON.stringify(payload)).toContain('Do not add keyword or regex preconditions');
  });

  it.each([
    ['Out of scope', 'out_of_scope', ['keyword', 'regex'], 'general college'],
    ['Respectful engagement', 'respectful_engagement', ['keyword', 'regex'], 'personal attacks'],
    ['Shitposts and memes except on Sundays', 'timed_subjective_content', ['keyword', 'regex'], 'shitposts'],
    ['AI Large Language Models LLM-generated content is not allowed', 'low_effort_ai_content', ['keyword', 'regex'], 'without claiming authorship'],
    ['College comparison posts are banned by default', 'college_comparison', ['regex'], 'college or university comparison'],
  ])('creates a strict plan for common rule "%s"', (intent, planName, forbidden, semanticText) => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent,
      timezone: 'America/Chicago',
      currentRules: [],
    });
    const rulePlanHint = payload.rulePlanHint as {
      name: string;
      requiredSemanticCondition: string;
      forbiddenConditionTypes?: string[];
    };

    expect(rulePlanHint.name).toBe(planName);
    expect(rulePlanHint.requiredSemanticCondition).toContain(semanticText);
    expect(rulePlanHint.forbiddenConditionTypes ?? []).toEqual(expect.arrayContaining(forbidden));
  });

  it.each([
    ['remove posts linking to example.com', 'url_domain'],
    ['require review for link posts', 'post_type'],
    ['filter posts with Hiring flair', 'flair'],
    ['flag titles under 10 characters', 'title_length'],
    ['filter posts with empty body under 25 characters', 'body_length'],
    ['only allow memes on Thursdays', 'day_of_week'],
    ['flag posts after 10pm', 'time_window'],
  ])('requires %s to use a %s condition when deterministic', (intent, conditionType) => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent,
      timezone: 'America/Chicago',
      currentRules: [],
    });
    const rulePlanHint = payload.rulePlanHint as { requiredConditionTypes: string[] };

    expect(rulePlanHint.requiredConditionTypes).toContain(conditionType);
  });

  it('includes a broad common-intent playbook for typical moderator prompts', () => {
    const payload = buildRuleBuilderPayload({
      mode: 'natural_language',
      intent: 'no AI slop',
      timezone: 'America/Chicago',
      currentRules: [],
    });
    const text = JSON.stringify(payload);

    expect(text).toContain('No AI slop or low-effort AI content');
    expect(text).toContain('Do not claim authorship detection');
    expect(text).toContain('No live interview, online assessment, exam, or contest question sharing');
    expect(text).toContain('Buying advice, laptop recommendations, or setup questions belong elsewhere');
  });

  it('throws a detailed error instead of creating a local fallback when OpenAI fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'upstream overloaded', type: 'server_error' },
    }), { status: 500 })));

    await expect(draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on sundays and if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    })).rejects.toMatchObject({
      code: 'openai_http_500',
      details: expect.arrayContaining([expect.stringContaining('Attempt 4')]),
    });
  });

  it('retries a transient OpenAI error and returns the real structured draft', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on sundays if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.enabled).toBe(false);
      expect(response.rule.conditions.some((condition) => condition.type === 'semantic')).toBe(true);
      expect(response.rule.conditions.some((condition) => condition.value.includes('disclaimer'))).toBe(true);
    }
  });

  it('reprompts when generated deterministic conditions encode exception logic as an AND trap', async () => {
    const unsafeDraft = validDraft({
      conditions: [
        {
          type: 'keyword',
          field: 'title_and_body',
          value: 'ragebait|satire',
          min: null,
          max: null,
          days: [],
          negate: false,
        },
        {
          type: 'day_of_week',
          field: null,
          value: '',
          min: null,
          max: null,
          days: ['Sunday'],
          negate: true,
        },
        {
          type: 'regex',
          field: 'body',
          value: '\\b(disclaimer|satire|parody)\\b',
          min: null,
          max: null,
          days: [],
          negate: true,
        },
        {
          type: 'semantic',
          field: null,
          value: 'ragebait',
          min: null,
          max: null,
          days: [],
          negate: false,
        },
      ],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(unsafeDraft))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on sundays if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('AND gates');
    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.conditions.some((condition) => condition.type === 'day_of_week' && condition.negate)).toBe(false);
      expect(response.rule.conditions.find((condition) => condition.type === 'semantic')?.value).toContain('disclaimer');
    }
  });

  it('reprompts when a specific planned intent incorrectly returns clarification questions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiClarificationResponse(['Which day should this apply to?']))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on sundays if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('disabled draft instead of needs_clarification');
    expect(response.status).toBe('draft');
  });

  it('reprompts when a Wednesday disclaimer draft omits the timing exception from semantic rubric', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        conditions: [
          {
            type: 'semantic',
            field: null,
            value:
              'Detect satire or ragebait posts. Match when the post is satire or ragebait and lacks a clear disclaimer. Do not match sincere discussion.',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        conditions: [
          {
            type: 'semantic',
            field: null,
            value:
              'Detect satire or ragebait posts. Match when the post is satire or ragebait and either it is not Wednesday in the subreddit timezone or it lacks a clear disclaimer at the bottom of the body. Do not match sincere discussion, or Wednesday satire/ragebait posts with a clear bottom disclaimer. Evidence cues must come from title, body, flair, and local datetime. If uncertain, choose needs_review.',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on wednesdays if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('semantic rubric is missing required RulePilot guidance: wednesday');
    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.modNotes).toContain('RulePilot conditions are ANDed');
    }
  });

  it('reprompts when a timed ragebait rule invents a regex synonym gate', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        conditions: [
          {
            type: 'regex',
            field: 'title',
            value: '(ragebait|satire|bait)',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
          {
            type: 'semantic',
            field: null,
            value:
              'Detect ragebait posts. Match when the post is ragebait and either it is not Wednesday or it lacks a disclaimer. Do not match sincere posts. Evidence cues must come from title, body, flair, URL/domain, post type, and local datetime. If uncertain, choose needs_review.',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        conditions: [
          {
            type: 'semantic',
            field: null,
            value:
              'Detect ragebait posts. Match when the post is ragebait and either the local subreddit timing is not Wednesday or the post body does not end with a clear disclaimer. Do not match sincere posts, meta discussion, non-ragebait content, or Wednesday ragebait posts that include a clear bottom-of-post disclaimer. Evidence cues must come from title, body, flair, URL/domain, post type, and local datetime. If uncertain, choose needs_review.',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on wednesdays if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('regex');
    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.conditions.some((condition) => condition.type === 'regex')).toBe(false);
      expect(response.rule.conditions.some((condition) => condition.type === 'semantic')).toBe(true);
    }
  });

  it('reprompts when a URL domain rule omits the url_domain condition', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        title: 'Block example.com links',
        description: 'Flag posts linking to example.com.',
        conditions: [
          {
            type: 'regex',
            field: 'url',
            value: 'example\\.com',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        title: 'Block example.com links',
        description: 'Flag posts linking to example.com.',
        conditions: [
          {
            type: 'url_domain',
            field: 'url',
            value: 'example.com',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'remove posts linking to example.com',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('url_domain');
    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.conditions.some((condition) => condition.type === 'url_domain')).toBe(true);
    }
  });

  it('reprompts when a planned AI slop draft omits a semantic condition', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        title: 'No AI slop',
        description: 'Flag low-effort AI content.',
        conditions: [
          {
            type: 'keyword',
            field: 'title_and_body',
            value: 'chatgpt|ai generated|prompt dump',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({
        title: 'No AI slop',
        description: 'Flag low-effort AI content.',
        conditions: [
          {
            type: 'semantic',
            field: null,
            value:
              'Detect low-effort AI content without claiming authorship detection. Match posts that are primarily generic, context-free, mass-produced, prompt-dump, pasted model output, or AI-wrapper spam with little original context. Do not match substantive discussion about AI tools, disclosed AI use with meaningful context, technical AI questions, or well-scoped examples. Evidence cues must come only from title, body, flair, URL/domain, and post type. If uncertain, choose needs_review or insufficient_context.',
            min: null,
            max: null,
            days: [],
            negate: false,
          },
        ],
      })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'no AI slop',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('requires exactly one semantic condition');
    expect(response.status).toBe('draft');
  });

  it('reprompts when local rule validation rejects the generated draft', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({ title: ''.padEnd(220, 'x') })))
      .mockResolvedValueOnce(openAiDraftResponse(validDraft({ title: 'Valid title after repair' })));
    vi.stubGlobal('fetch', fetchMock);
    const validateDraft = vi.fn()
      .mockReturnValueOnce('Title must be 200 characters or fewer.')
      .mockReturnValueOnce(null);

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'no ragebait unless it follows the rule',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
      validateDraft,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(validateDraft).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(JSON.stringify(secondBody)).toContain('Title must be 200 characters or fewer');
    expect(response.status).toBe('draft');
  });
});
