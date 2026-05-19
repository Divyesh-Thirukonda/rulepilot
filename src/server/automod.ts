import type { CaseRecord, ClassificationResult, PostInput } from '../shared/types';

export function automodResult(reason: string): ClassificationResult {
  return {
    decision: 'needs_review',
    ruleId: null,
    confidence: 1,
    rationale: `AutoModerator filtered this post before RulePilot acted. Reason: ${reason || 'No reason provided'}.`,
    suggestedAction: 'log',
    source: 'fallback',
    matchedSignals: ['automoderator already filtered post'],
  };
}

export function buildAutomoderatorCase(postInput: PostInput, reason: string, now = new Date()): CaseRecord {
  const timestamp = now.toISOString();
  const record: CaseRecord = {
    id: `${postInput.id}:automod`,
    postId: postInput.id,
    postTitle: postInput.title,
    subredditName: postInput.subredditName,
    createdAt: timestamp,
    updatedAt: timestamp,
    result: automodResult(reason),
    action: 'automod_filtered',
  };
  if (postInput.permalink) {
    record.postPermalink = postInput.permalink;
  }
  return record;
}
