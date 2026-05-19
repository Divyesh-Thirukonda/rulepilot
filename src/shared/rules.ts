import type { RuleConfig, RuleConfigV2 } from './types';

const NOW = new Date().toISOString();

/**
 * The r/csMajors preset rules expressed in RuleConfigV2 format.
 * Conditions are extracted from the former hardcoded heuristics so the
 * generic condition engine produces the same results.
 */
export const CS_MAJORS_PRESET: RuleConfigV2[] = [
  {
    id: 'out-of-scope',
    title: 'Out of scope',
    description:
      'Discussion should relate to university-level computer science or closely related education. General college questions belong in r/college; mostly career/job questions belong in r/cscareerquestions.',
    examples: ['Which dorm should I choose?', 'How do I negotiate a salary after two years at work?'],
    negativeExamples: ['Best algorithms course for a CS sophomore?'],
    action: 'filter',
    threshold: 0.78,
    category: 'scope',
    redirectTargetType: 'subreddit',
    redirectTarget: 'r/cscareerquestions',
    redirectTemplate: 'This looks mostly like career or job advice. Consider directing the author to r/cscareerquestions.',
    redirect: 'Try r/college for general university questions or r/cscareerquestions for career-first questions.',
    enabled: true,
    conditions: [
      {
        type: 'keyword',
        field: 'title_and_body',
        value: 'salary|negotiate|promotion|layoff|manager|senior engineer|years of experience|yoe|switch jobs|job offer|career change',
      },
      {
        type: 'keyword',
        field: 'title_and_body',
        value: 'student|freshman|sophomore|junior|senior year|college|university|class|course|major|internship|new grad|campus',
        negate: true,
      },
    ],
    modNotes: 'Also fires for general-college signals (dorm, roommate, meal plan, etc.) when no CS keywords are present. The LLM handles the semantic fallback.',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'respectful-engagement',
    title: 'Respectful engagement',
    description: 'Offensive posts or comments are not permitted. Common sense is expected from users.',
    examples: ['Posts attacking another user or group instead of discussing the topic.'],
    negativeExamples: ['Respectful criticism of a university program'],
    action: 'flag',
    threshold: 0.82,
    category: 'civility',
    enabled: true,
    conditions: [
      { type: 'semantic', value: 'offensive or disrespectful language toward individuals or groups' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'shitposts-and-memes',
    title: 'Shitposts and memes',
    description: 'Shitposts and memes require moderator authorization except on Sundays.',
    examples: ['Meme image posts', 'low-context joke posts with Shitpost flair on a weekday'],
    negativeExamples: ['Sunday meme post'],
    action: 'filter',
    threshold: 0.72,
    category: 'format',
    redirectTargetType: 'subreddit',
    redirectTarget: 'r/ProgrammerHumor',
    redirectTemplate: 'Memes and low-context humor usually belong in r/ProgrammerHumor unless this subreddit allows them today.',
    redirect: 'Use r/ProgrammerHumor unless it is Sunday or the mods have approved the post.',
    repairStrategy: 'repost_later',
    repairTemplate: 'This post may be allowed if reposted on the community meme day. Please review the subreddit rules and repost on Sunday if appropriate.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'meme|shitpost|starter pack|when you|me when|pov:|be like' },
      { type: 'flair', value: 'meme|shitpost|humor|joke|funny' },
      { type: 'day_of_week', value: '', days: ['Sunday'], negate: true },
    ],
    modNotes: 'The keyword OR flair condition fires the match. The day_of_week condition inverts: the rule only fires when it is NOT Sunday.',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'live-oa-questions',
    title: 'Discussing online assessment and interview questions',
    description:
      'Users may not discuss live OA questions from official CodeSignal assessments or questions currently used by a company assessment.',
    examples: ['Here is the exact CodeSignal question I got today', 'What is the solution to company X live OA problem 2?'],
    negativeExamples: ['Practice Leetcode question discussion', 'Study guide for coding interviews'],
    action: 'filter',
    threshold: 0.78,
    category: 'sensitive',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'live|actual|official|current|real|today|got|received|company|codesignal|hackerrank|oa|online assessment' },
      { type: 'keyword', field: 'title_and_body', value: 'oa|online assessment|codesignal|hackerrank|assessment question|problem \\d|question \\d' },
      { type: 'keyword', field: 'title_and_body', value: 'practice|mock|sample|leetcode|neetcode|study guide|prep', negate: true },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'low-quality',
    title: 'Lazy or low-quality posts',
    description:
      'Posts are expected to include enough effort and detail to be answerable. Empty, incomprehensible, title-only, or context-free polls are likely to be removed.',
    examples: ['Title-only post: Help', 'Poll asking readers to choose a company with no context'],
    negativeExamples: ['Short but specific question with enough context'],
    action: 'filter',
    threshold: 0.74,
    category: 'quality',
    enabled: true,
    conditions: [
      { type: 'body_length', value: '', max: 25 },
      { type: 'keyword', field: 'title', value: 'help|question|advice|what do|which one|poll' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
];

// ---------------------------------------------------------------------------
// Legacy helpers — still used by storage.ts buildStats for now
// ---------------------------------------------------------------------------

/** Legacy RuleConfig array for backward compat. */
export const CS_MAJORS_RULES: RuleConfig[] = CS_MAJORS_PRESET.map((v2) => {
  const base: RuleConfig = {
    id: v2.id,
    title: v2.title,
    description: v2.description,
    examples: v2.examples,
    action: v2.action,
    threshold: v2.threshold,
    category: v2.category,
    enabledByDefault: v2.enabled,
  };
  if (v2.redirect !== undefined) {
    base.redirect = v2.redirect;
  }
  return base;
});

export const DEFAULT_ENABLED_RULE_IDS = CS_MAJORS_PRESET.filter((rule) => rule.enabled).map((rule) => rule.id);

export function getRuleById(ruleId: string | null | undefined): RuleConfigV2 | undefined {
  if (!ruleId) {
    return undefined;
  }
  return CS_MAJORS_PRESET.find((rule) => rule.id === ruleId);
}

/** Generate a unique rule id for mod-created rules. */
export function generateRuleId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
