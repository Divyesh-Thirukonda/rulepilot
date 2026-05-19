import { describe, expect, it } from 'vitest';

import { buildRuleBuilderPayload, buildTemplateRuleDraft, parseRuleBuilderResponse } from './rule-builder';

describe('RulePilot AI Builder', () => {
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

  it('generates one-click template drafts with expected defaults', () => {
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
    expect(JSON.stringify(payload)).toContain('no shitposts');
    expect(JSON.stringify(payload)).toContain('Do not match sincere questions');
  });
});
