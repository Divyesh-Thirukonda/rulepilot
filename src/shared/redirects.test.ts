import { describe, expect, it } from 'vitest';

import {
  createRepairDraftUrl,
  createSubredditDraftUrl,
  isValidRedirectTarget,
  redirectForRule,
  redirectTargetUrl,
  subredditNameFromTarget,
} from './redirects';
import type { RuleConfigV2 } from './types';

const baseRule: RuleConfigV2 = {
  id: 'test-rule',
  title: 'Test rule',
  description: 'Test',
  examples: [],
  negativeExamples: [],
  action: 'flag',
  threshold: 0.75,
  category: 'scope',
  enabled: true,
  conditions: [],
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
  source: 'custom',
};

describe('redirect helpers', () => {
  it('resolves subreddit targets and creates draft links', () => {
    const redirect = redirectForRule({
      ...baseRule,
      redirectTargetType: 'subreddit',
      redirectTarget: 'r/cscareerquestions',
      redirectTemplate: 'Please post this in r/cscareerquestions.',
    });

    expect(redirect).toEqual({
      targetType: 'subreddit',
      target: 'r/cscareerquestions',
      template: 'Please post this in r/cscareerquestions.',
      legacy: false,
    });
    expect(redirectTargetUrl(redirect!)).toBe('https://www.reddit.com/r/cscareerquestions/');
    const draftUrl = createSubredditDraftUrl({
      redirect: redirect!,
      postTitle: 'Career advice after graduation',
      postPermalink: '/r/csMajors/comments/abc123/title/',
    });
    expect(draftUrl).toContain('https://www.reddit.com/r/cscareerquestions/submit?');
    const draftParams = new URL(draftUrl!).searchParams;
    expect(draftParams.get('title')).toBe('Career advice after graduation');
    expect(draftParams.get('text')).toContain('Original post: https://www.reddit.com/r/csMajors/comments/abc123/title/');
  });

  it('falls back to legacy redirect guidance without target actions', () => {
    const redirect = redirectForRule({
      ...baseRule,
      redirect: 'Try r/college for general college questions.',
    });

    expect(redirect).toEqual({
      targetType: 'custom',
      target: 'Legacy guidance',
      template: 'Try r/college for general college questions.',
      legacy: true,
    });
    expect(redirectTargetUrl(redirect!)).toBeUndefined();
    expect(createSubredditDraftUrl({ redirect: redirect!, postTitle: 'Dorm question' })).toBeUndefined();
  });

  it('opens megathread and URL targets but does not create subreddit drafts', () => {
    const megathread = redirectForRule({
      ...baseRule,
      redirectTargetType: 'megathread',
      redirectTarget: 'https://www.reddit.com/r/csMajors/comments/thread/resume_sticky/',
      redirectTemplate: 'Please use the resume sticky.',
    });
    const url = redirectForRule({
      ...baseRule,
      redirectTargetType: 'url',
      redirectTarget: 'https://www.reddit.com/r/csMajors/wiki/index',
      redirectTemplate: 'Please use the wiki.',
    });

    expect(redirectTargetUrl(megathread!)).toBe('https://www.reddit.com/r/csMajors/comments/thread/resume_sticky/');
    expect(redirectTargetUrl(url!)).toBe('https://www.reddit.com/r/csMajors/wiki/index');
    expect(createSubredditDraftUrl({ redirect: megathread!, postTitle: 'Resume review' })).toBeUndefined();
    expect(createSubredditDraftUrl({ redirect: url!, postTitle: 'Wiki question' })).toBeUndefined();
  });

  it('validates target shapes for Rule Studio serialization', () => {
    expect(subredditNameFromTarget('r/EngineeringStudents')).toBe('EngineeringStudents');
    expect(subredditNameFromTarget('EngineeringStudents')).toBe('EngineeringStudents');
    expect(isValidRedirectTarget('subreddit', 'not a subreddit')).toBe(false);
    expect(isValidRedirectTarget('url', 'https://www.reddit.com/r/csMajors/wiki/index')).toBe(true);
    expect(isValidRedirectTarget('url', 'ftp://example.com')).toBe(false);
    expect(isValidRedirectTarget('megathread', 'Resume sticky')).toBe(true);
    expect(isValidRedirectTarget('custom', 'Ask mods first')).toBe(true);
  });

  it('creates same-subreddit fixed-post drafts without copying original body', () => {
    const draftUrl = createRepairDraftUrl({
      subredditName: 'csMajors',
      postTitle: 'POV: compiler errors on Monday',
      repairTemplate: 'Please repost this on Sunday if appropriate.',
      postPermalink: '/r/csMajors/comments/fixable/title/',
    });

    expect(draftUrl).toContain('https://www.reddit.com/r/csMajors/submit?');
    const params = new URL(draftUrl!).searchParams;
    expect(params.get('title')).toBe('POV: compiler errors on Monday');
    expect(params.get('text')).toContain('Please repost this on Sunday if appropriate.');
    expect(params.get('text')).toContain('Original post: https://www.reddit.com/r/csMajors/comments/fixable/title/');
    expect(params.get('text')).toContain('RulePilot does not copy or store the original post body.');
  });
});
