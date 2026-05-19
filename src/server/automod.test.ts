import { describe, expect, it } from 'vitest';

import { buildAutomoderatorCase } from './automod';

describe('AutoModerator awareness', () => {
  it('creates an audit case showing RulePilot stood down after AutoModerator filtered', () => {
    const record = buildAutomoderatorCase(
      {
        id: 't3_automod',
        title: 'Filtered by automod',
        subredditName: 'csMajors',
        permalink: '/r/csMajors/comments/automod/title/',
      },
      'matched AutoModerator rule',
      new Date('2026-05-19T05:00:00.000Z')
    );

    expect(record).toMatchObject({
      id: 't3_automod:automod',
      postId: 't3_automod',
      action: 'automod_filtered',
      createdAt: '2026-05-19T05:00:00.000Z',
      updatedAt: '2026-05-19T05:00:00.000Z',
      result: {
        ruleId: null,
        confidence: 1,
        suggestedAction: 'log',
        source: 'fallback',
      },
    });
    expect(record.result.rationale).toContain('AutoModerator filtered this post before RulePilot acted');
    expect(record.result.matchedSignals).toEqual(['automoderator already filtered post']);
  });
});
