import { describe, expect, it } from 'vitest';

import { buildTemplateRuleDraft, parseRuleBuilderResponse } from './rule-builder';

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
});
