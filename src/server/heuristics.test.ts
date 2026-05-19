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

  it('routes resume posts to the resume sticky', () => {
    const result = deterministicClassifyPost(
      post({
        title: 'Please roast my SWE resume',
        body: 'I need resume feedback for internship applications.',
      }),
      CS_MAJORS_PRESET,
      monday
    );

    expect(result?.ruleId).toBe('resume-sticky');
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

  it.each([
    ['laptop-posts', 'Which laptop should I buy for CS?', 'MacBook or ThinkPad for programming?'],
    ['college-comparison', 'UIUC CS vs Georgia Tech CS?', 'Help me choose between these universities.'],
    ['personal-projects', 'I built a new internship tracker app', 'Check out my project and GitHub repo.'],
    ['amas-surveys-hiring-referrals', 'Please fill out my CS student survey', 'This is for a research study.'],
    ['amas-surveys-hiring-referrals', 'Can anyone refer me to Google?', 'Looking for a referral.'],
  ])('matches %s for "%s"', (ruleId, title, body) => {
    const result = deterministicClassifyPost(post({ title, body }), CS_MAJORS_PRESET, monday);
    expect(result?.ruleId).toBe(ruleId);
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
