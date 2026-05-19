import { describe, expect, it } from 'vitest';

import { EDUCATION_SUBREDDIT_PRESET, getRuleById } from './rules';

describe('education subreddit preset', () => {
  it('ships as a disabled generic starter pack with key education workflows', () => {
    expect(EDUCATION_SUBREDDIT_PRESET).toHaveLength(8);
    expect(EDUCATION_SUBREDDIT_PRESET.every((rule) => rule.enabled === false)).toBe(true);
    expect(EDUCATION_SUBREDDIT_PRESET.map((rule) => rule.id)).toEqual([
      'education-homework-effort',
      'education-surveys-approval',
      'education-memes-sunday',
      'education-school-comparison',
      'education-resume-career-thread',
      'education-buying-advice',
      'education-low-quality',
      'education-self-promotion',
    ]);
  });

  it('is available to stats and lookup helpers', () => {
    expect(getRuleById('education-homework-effort')?.title).toBe('Homework help requires effort');
  });

  it('marks fixable education rules with repair guidance', () => {
    const fixable = EDUCATION_SUBREDDIT_PRESET.filter((rule) => rule.repairTemplate);

    expect(fixable.map((rule) => rule.id)).toEqual([
      'education-homework-effort',
      'education-surveys-approval',
      'education-memes-sunday',
      'education-resume-career-thread',
      'education-low-quality',
    ]);
    expect(fixable.every((rule) => rule.repairStrategy !== undefined)).toBe(true);
  });
});
