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

  it('flags live OA question discussion but allows practice OA prep', () => {
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

    expect(live?.ruleId).toBe('live-oa-questions');
    expect(practice?.ruleId).not.toBe('live-oa-questions');
  });

  it('applies weekday meme filtering and Sunday meme exception', () => {
    const weekday = deterministicClassifyPost(post({ title: 'POV: your DSA midterm compiles', flairText: 'Shitpost' }), CS_MAJORS_PRESET, monday);
    const weekend = deterministicClassifyPost(post({ title: 'POV: your DSA midterm compiles', flairText: 'Shitpost' }), CS_MAJORS_PRESET, sunday);

    expect(weekday?.ruleId).toBe('shitposts-and-memes');
    expect(weekday?.suggestedAction).toBe('filter_to_modqueue');
    expect(weekend?.ruleId).toBe('shitposts-and-memes');
    expect(weekend?.suggestedAction).toBe('allow');
  });

  it('matches lazy or low-quality posts', () => {
    const result = deterministicClassifyPost(
      post({ title: 'Need advice', body: 'help' }),
      CS_MAJORS_PRESET,
      monday
    );

    expect(result?.ruleId).toBe('low-quality');
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
