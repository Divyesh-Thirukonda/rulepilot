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

  it('uses semantic-first OA handling with a deterministic catch for obvious exact-question requests', () => {
    const live = deterministicClassifyPost(
      post({
        title: 'Got the live CodeSignal OA today, what is the answer to question 2?',
      }),
      CS_MAJORS_PRESET,
      monday
    );
    const exactInterview = deterministicClassifyPost(
      post({
        title: 'help with meta interview',
        body: 'what were questions for new grad interview on 9/17/2025',
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
    expect(live?.ruleId).toBe('live-oa-questions');
    expect(exactInterview?.ruleId).toBe('live-oa-questions');
    expect(exactInterview?.suggestedAction).toBe('filter_to_modqueue');
    expect(exactInterview?.matchedSignals).toContain('asks for exact OA/interview questions');
    expect(practice?.ruleId).not.toBe('live-oa-questions');
    expect(liveOaRule?.conditions).toEqual([
      expect.objectContaining({ type: 'semantic' }),
    ]);
    expect(liveOaRule?.conditions[0]?.value).toContain('Do not match practice resources');
  });

  it('does not deterministically flag general company interview prep as exact-question leakage', () => {
    const result = deterministicClassifyPost(
      post({
        title: 'How should I prepare for a Meta new grad interview?',
        body: 'Looking for topics to study and format tips, not actual questions.',
      }),
      CS_MAJORS_PRESET,
      monday
    );

    expect(result?.ruleId).not.toBe('live-oa-questions');
  });

  it('does not treat interviewer-question advice as assessment question leakage', () => {
    const result = deterministicClassifyPost(
      post({
        title: 'What questions should I ask my Meta interviewer?',
        body: 'I want good questions about team culture and mentorship.',
      }),
      CS_MAJORS_PRESET,
      monday
    );

    expect(result?.ruleId).not.toBe('live-oa-questions');
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
