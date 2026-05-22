import { describe, expect, it } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import type { PostInput } from '../shared/types';
import { deterministicClassifyPost, isSundayInTimezone } from './heuristics';

const monday = new Date('2026-05-18T17:00:00.000Z');
const sunday = new Date('2026-05-17T17:00:00.000Z');

function post(input: Partial<PostInput> & Pick<PostInput, 'title'>): PostInput {
  return {
    id: input.id ?? 't3_test',
    subredditName: input.subredditName ?? 'csMajors',
    title: input.title,
    body: input.body ?? '',
    flairText: input.flairText,
    url: input.url,
    createdAt: input.createdAt ?? monday,
  };
}

describe('deterministicClassifyPost', () => {
  it('keeps the default r/csMajors preset focused for the demo', () => {
    expect(CS_MAJORS_PRESET.map((rule) => rule.id)).toEqual([
      'out-of-scope',
      'respectful-engagement',
      'shitposts-and-memes',
      'live-oa-questions',
      'low-quality',
    ]);
    for (const rule of CS_MAJORS_PRESET) {
      const semantic = rule.conditions.find((condition) => condition.type === 'semantic');
      expect(semantic?.value.length, rule.id).toBeGreaterThan(250);
    }
  });

  it('routes career-only posts to out-of-scope guidance', () => {
    const result = deterministicClassifyPost(
      post({
        title: 'How do I negotiate salary after two years as a software engineer?',
        body: 'I am no longer in school and want advice on a job offer.',
      }),
      CS_MAJORS_PRESET,
      monday
    );

    expect(result?.ruleId).toBe('out-of-scope');
    expect(result?.suggestedAction).toBe('filter_to_modqueue');
  });

  it('keeps nuanced OA handling semantic instead of keyword-only', () => {
    const live = deterministicClassifyPost(
      post({
        title: 'Got the live CodeSignal OA today, what is the answer to question 2?',
      }),
      CS_MAJORS_PRESET,
      monday
    );
    const practice = deterministicClassifyPost(
      post({
        title: 'Best practice CodeSignal tests for OA prep?',
        body: 'Looking for mock and practice resources, not real company questions.',
      }),
      CS_MAJORS_PRESET,
      monday
    );

    const liveOaRule = CS_MAJORS_PRESET.find((rule) => rule.id === 'live-oa-questions');
    expect(live).toBeNull();
    expect(practice?.ruleId).not.toBe('live-oa-questions');
    expect(liveOaRule?.conditions).toEqual([
      expect.objectContaining({ type: 'semantic' }),
    ]);
    expect(liveOaRule?.conditions[0]?.value).toContain('Do not match practice resources');
  });

  it('models meme timing as a deterministic precondition plus semantic content rubric', () => {
    const weekday = deterministicClassifyPost(post({ title: 'POV: your DSA midterm compiles', flairText: 'Shitpost' }), CS_MAJORS_PRESET, monday);
    const weekend = deterministicClassifyPost(post({ title: 'POV: your DSA midterm compiles', flairText: 'Shitpost' }), CS_MAJORS_PRESET, sunday);
    const memeRule = CS_MAJORS_PRESET.find((rule) => rule.id === 'shitposts-and-memes');

    expect(weekday).toBeNull();
    expect(weekend).toBeNull();
    expect(memeRule?.conditions).toEqual([
      expect.objectContaining({ type: 'day_of_week', days: ['Sunday'], negate: true }),
      expect.objectContaining({ type: 'semantic' }),
    ]);
  });

  it('keeps low-quality handling semantic instead of body-length keyword gating', () => {
    const result = deterministicClassifyPost(
      post({ title: 'Need advice', body: 'help' }),
      CS_MAJORS_PRESET,
      monday
    );
    const lowQualityRule = CS_MAJORS_PRESET.find((rule) => rule.id === 'low-quality');

    expect(result).toBeNull();
    expect(lowQualityRule?.action).toBe('flag');
    expect(lowQualityRule?.conditions).toEqual([
      expect.objectContaining({ type: 'semantic' }),
    ]);
  });

  it('matches literal keyword phrases with symbols instead of treating them like regex words', () => {
    const result = deterministicClassifyPost(
      post({ title: 'Is C++ required for systems class?', body: 'I am comparing C++ and .NET electives.' }),
      [{
        id: 'custom-symbol-keywords',
        title: 'Symbol keywords',
        description: 'Matches literal CS terms with punctuation.',
        examples: [],
        negativeExamples: [],
        action: 'flag',
        threshold: 0.76,
        category: 'quality',
        enabled: true,
        redirect: '',
        modNotes: '',
        conditions: [{ type: 'keyword', field: 'title_and_body', value: 'C++|.NET|r/csMajors' }],
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
        source: 'custom',
      }],
      monday
    );

    expect(result?.ruleId).toBe('custom-symbol-keywords');
    expect(result?.matchedSignals[0]).toContain('c++');
  });
});

describe('isSundayInTimezone', () => {
  it('uses the configured timezone', () => {
    expect(isSundayInTimezone(sunday, 'America/Chicago')).toBe(true);
    expect(isSundayInTimezone(monday, 'America/Chicago')).toBe(false);
  });
});
