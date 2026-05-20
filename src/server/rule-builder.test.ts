import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFallbackRuleDraft,
  buildRuleBuilderPayload,
  buildTemplateRuleDraft,
  draftRuleWithOpenAI,
  parseRuleBuilderResponse,
} from './rule-builder';

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

  it('falls back to a disabled local draft instead of surfacing an OpenAI failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream unavailable', { status: 500 })));

    const response = await draftRuleWithOpenAI({
      request: {
        mode: 'natural_language',
        intent: 'only allow ragebait posts on sundays and if they put a disclaimer at the bottom of the post',
        timezone: 'America/Chicago',
        currentRules: [],
      },
      apiKey: 'test-key',
      model: 'gpt-5-nano',
    });

    expect(response.status).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.enabled).toBe(false);
      expect(response.rule.title).toBe('Timed satire and ragebait rule');
      expect(response.rule.conditions.some((condition) => condition.type === 'day_of_week' && condition.negate)).toBe(true);
      expect(response.rule.conditions.some((condition) => condition.type === 'regex' && condition.field === 'body' && condition.negate)).toBe(true);
      expect(response.rule.conditions.some((condition) => condition.type === 'semantic' && condition.value.includes('disclaimer'))).toBe(true);
      expect(response.rule.modNotes).toContain('Fallback draft');
    }
  });

  it('can create conservative fallback drafts for common demo prompts', () => {
    const prompts = [
      'only allow ragebait posts on sundays and if they put a disclaimer at the bottom of the post',
      'no AI slop',
      'require approval for surveys',
      'route resume posts to a megathread',
      'no live OA questions',
      'no homework answer requests without effort',
      'no hiring or referral posts without mod approval',
      'flag rude posts',
      'route laptop buying advice elsewhere',
      'no low effort title only questions',
      'no spoiler posts without title tags',
      'flag off topic career-only posts',
      'personal project showcases must include technical detail',
      'no self promotion spam',
      'only allow memes on Sundays',
    ];

    for (const intent of prompts) {
      const response = buildFallbackRuleDraft({
        mode: 'natural_language',
        intent,
        timezone: 'America/Chicago',
        currentRules: [],
      });
      expect(response.status, intent).toBe('draft');
      if (response.status === 'draft') {
        expect(response.rule.enabled, intent).toBe(false);
        expect(response.rule.title.length, intent).toBeGreaterThan(0);
        expect(response.rule.conditions.length, intent).toBeGreaterThan(0);
        expect(response.rule.conditions.some((condition) => condition.type === 'semantic'), intent).toBe(true);
        expect(response.rule.conditions.at(-1)?.value, intent).toContain('Evidence cues');
      }
    }
  });
});
