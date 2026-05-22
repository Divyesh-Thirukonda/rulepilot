import type { RuleConfig, RuleConfigV2 } from './types';

const NOW = '2026-05-21T00:00:00.000Z';

const outOfScopeRubric = [
  'Match when the post is primarily outside university-level computer science or closely related education.',
  'This includes general college-life/admin questions such as dorms, roommates, meal plans, parking, or financial aid when they are not tied to CS education.',
  'It also includes career/job/recruiting/interview advice when the main question is career-first rather than about being a current CS or related-major student.',
  'Do not match posts about CS coursework, algorithms, data structures, choosing CS classes, CS major planning, internships/new-grad topics connected to school, or mixed posts where the CS-education angle is substantial.',
  'If the post has both an on-topic CS education angle and an off-topic angle, choose needs_review instead of violation.',
].join(' ');

const respectfulEngagementRubric = [
  'Match when the post contains harassment, personal attacks, identity-based insults, slurs, demeaning language toward a person or group, threats, encouragement of self-harm, or hostile content aimed at other users.',
  'Do not match civil disagreement, blunt but topic-focused criticism, frustration about school/jobs/classes, or good-faith debate that does not attack a person or protected group.',
  'Use only visible title/body/flair evidence. If the tone is ambiguous or the post quotes offensive language for discussion rather than using it, choose needs_review.',
].join(' ');

const memeRubric = [
  'Match when the post is primarily a meme, shitpost, low-context joke, satire/ragebait post, image-macro style post, "POV" / "me when" humor, or intentionally unserious content rather than a substantive CS-major discussion.',
  'Do not match sincere personal experiences, serious advice requests, substantive discussion that happens to contain a joke, moderator-approved posts, or Sunday posts allowed by the community exception.',
  'Use title, body, flair, post type, and local weekday as evidence. If it is unclear whether the post is a joke-only post or a serious discussion with humor, choose needs_review.',
].join(' ');

const liveOaRubric = [
  'Match when the post asks for, shares, requests solutions to, or discusses exact active/live online-assessment or interview questions currently used by a company or official platform such as CodeSignal, HackerRank, or a company OA.',
  'Strong matches include posts saying they received the OA today/recently, naming a company assessment, asking for the answer to a specific problem number, or sharing exact question text from an active assessment.',
  'Do not match practice resources, mock tests, LeetCode/NeetCode prep, general interview study advice, high-level non-specific interview experiences, or questions that clearly avoid active/real assessment content.',
  'If the post mentions OA/interviews but it is unclear whether the question is live, official, or practice-only, choose needs_review.',
].join(' ');

const lowQualityRubric = [
  'Match when the post is too low-effort or underspecified for moderators/community members to evaluate: title-only help/advice posts, empty or near-empty bodies, incoherent wording, context-free polls, low-effort crossposts, or "which class/company/school should I choose" posts with no relevant criteria.',
  'Do not match concise posts that still include enough concrete context, constraints, goals, tradeoffs, or prior effort for people to answer.',
  'Use title/body length, presence of useful details, whether the post asks a clear question, and whether the author explains the situation. If the post is short but answerable, choose needs_review or allowed rather than violation.',
].join(' ');

/**
 * The r/csMajors preset rules expressed in RuleConfigV2 format.
 * Preset rules are semantic-first because these are the nuanced cases that
 * AutoModerator-style keyword rules do not handle well.
 */
export const CS_MAJORS_PRESET: RuleConfigV2[] = [
  {
    id: 'out-of-scope',
    title: 'Out of scope',
    description:
      'Discussion should relate to university-level computer science or closely related education. General college questions belong in r/college; mostly career/job questions belong in r/cscareerquestions.',
    examples: [
      'Which dorm should I choose as a freshman?',
      'How do I negotiate salary after two years as a software engineer?',
      'Should I park in the west campus garage or buy a city pass?',
    ],
    negativeExamples: [
      'Best algorithms course for a CS sophomore?',
      'How should I choose between an OS elective and a compilers elective?',
      'How do CS internships fit into sophomore-year course planning?',
    ],
    action: 'filter',
    threshold: 0.78,
    category: 'scope',
    redirectTargetType: 'subreddit',
    redirectTarget: 'r/cscareerquestions',
    redirectTemplate: 'This looks mostly like career or job advice. Consider directing the author to r/cscareerquestions.',
    redirect: 'Try r/college for general university questions or r/cscareerquestions for career-first questions.',
    enabled: true,
    conditions: [{ type: 'semantic', value: outOfScopeRubric }],
    modNotes: 'Semantic-first by design: this rule needs to distinguish CS-education context from general college or career-only context, which keyword gates over-narrow.',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'respectful-engagement',
    title: 'Respectful engagement',
    description: 'Posts should engage respectfully. Personal attacks, harassment, slurs, and hostile identity-based insults are not allowed.',
    examples: [
      'A post attacking another user instead of discussing the topic.',
      'A rant using slurs or demeaning language toward a group.',
      'A hostile post telling another student they do not belong in CS.',
    ],
    negativeExamples: [
      'Respectful criticism of a university program.',
      'A frustrated but topic-focused post about a difficult class.',
      'Civil disagreement about whether a school has a strong CS program.',
    ],
    action: 'flag',
    threshold: 0.82,
    category: 'civility',
    enabled: true,
    conditions: [{ type: 'semantic', value: respectfulEngagementRubric }],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'shitposts-and-memes',
    title: 'Shitposts and memes',
    description: 'Shitposts and memes require moderator authorization except on Sundays.',
    examples: [
      'POV: your DSA midterm compiles, posted on a Monday.',
      'A low-context starter-pack meme about CS majors on a weekday.',
      'A bait post written only to provoke jokes or outrage.',
    ],
    negativeExamples: [
      'Sunday meme post.',
      'Serious advice request with one joke in the title.',
      'Substantive discussion about CS culture that is not joke-only.',
    ],
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
      { type: 'day_of_week', value: '', days: ['Sunday'], negate: true },
      { type: 'semantic', value: memeRubric },
    ],
    modNotes: 'Uses a deterministic Sunday exception plus semantic content judgment. Avoid keyword/flair gates because joke posts often avoid exact meme wording.',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'live-oa-questions',
    title: 'Discussing online assessment and interview questions',
    description:
      'Users may not discuss live OA questions from official CodeSignal assessments or questions currently used by a company assessment.',
    examples: [
      'Here is the exact CodeSignal question I got today.',
      'What is the solution to company X live OA problem 2?',
      'I just received the HackerRank for company Y, can someone solve this prompt?',
    ],
    negativeExamples: [
      'Practice LeetCode question discussion.',
      'Study guide for coding interviews.',
      'What topics should I review before online assessments?',
    ],
    action: 'filter',
    threshold: 0.78,
    category: 'sensitive',
    enabled: true,
    conditions: [{ type: 'semantic', value: liveOaRubric }],
    modNotes: 'Semantic-first by design: the hard part is distinguishing active/live assessment content from practice prep and high-level interview discussion.',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'low-quality',
    title: 'Lazy or low-quality posts',
    description:
      'Posts are expected to include enough effort and detail to be answerable. Empty, incomprehensible, title-only, or context-free polls are likely to be removed.',
    examples: [
      'Title-only post: Help.',
      'Poll asking readers to choose a company with no context.',
      'Which class should I take? with no school, goals, constraints, or options explained.',
    ],
    negativeExamples: [
      'Short but specific question with enough context.',
      'A concise post comparing two classes with workload, goals, and constraints.',
      'A brief debugging or scheduling question that includes the relevant details.',
    ],
    action: 'flag',
    threshold: 0.78,
    category: 'quality',
    enabled: true,
    conditions: [{ type: 'semantic', value: lowQualityRubric }],
    modNotes: 'Defaults to review rather than automatic filtering. The LLM should use quality indicators and visible context, not just body length.',
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
