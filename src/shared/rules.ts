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
    id: 'amas-surveys-hiring-referrals',
    title: 'AMAs, surveys, hiring and referrals',
    description: 'AMAs, surveys, hiring requests, and referral requests/offers require prior moderator approval.',
    examples: ['Fill out my research survey', 'Hiring interns for my startup', 'Can someone refer me?'],
    negativeExamples: ['Discussing the survey methodology of a CS study'],
    action: 'filter',
    threshold: 0.76,
    category: 'promotion',
    redirectTargetType: 'custom',
    redirectTarget: 'Mod approval',
    redirectTemplate: 'AMAs, surveys, hiring posts, and referral posts need prior moderator approval before they go live.',
    redirect: 'Ask the moderators for approval before posting AMAs, surveys, hiring requests, or referrals.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'survey|questionnaire|research study|ama|ask me anything|hiring|we are hiring|apply now|referral|refer me|can refer' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'resume-sticky',
    title: 'Resume sticky',
    description: 'Resume review posts belong in the resume sticky thread or a resume-focused subreddit.',
    examples: ['Roast my resume', 'Can someone review my SWE resume?'],
    negativeExamples: ['Discussion about resume best practices for CS students'],
    action: 'filter',
    threshold: 0.7,
    category: 'megathread',
    redirectTargetType: 'megathread',
    redirectTarget: 'Resume sticky',
    redirectTemplate: 'Resume reviews belong in the resume sticky thread. If the current sticky has a URL, paste it into this rule before using Open target.',
    redirect: 'Post in the resume sticky thread or try r/EngineeringResumes.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'resume|cv' },
      { type: 'keyword', field: 'title_and_body', value: 'review|roast|feedback|rate|help|critique|screen' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'amazon-optional',
    title: 'Amazon currently optional',
    description: 'Amazon-related queries are recommended for the dedicated megathread, but this is currently optional.',
    examples: ['Amazon intern OA timeline', 'Amazon new grad waitlist'],
    negativeExamples: ['Mentioning Amazon AWS in a cloud computing course discussion'],
    action: 'log',
    threshold: 0.8,
    category: 'megathread',
    redirectTargetType: 'megathread',
    redirectTarget: 'Amazon megathread',
    redirectTemplate: 'Amazon-specific recruiting questions are repetitive. Consider directing the author to the Amazon megathread.',
    redirect: 'Consider the Amazon megathread for repetitive Amazon-specific questions.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'amazon' },
      { type: 'keyword', field: 'title_and_body', value: 'oa|new grad|intern|interview|recruiter|sde|offer|waitlist' },
    ],
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
    id: 'spam',
    title: 'Spam',
    description:
      'Spam and promotional content are not allowed. Useful links are fine when the purpose is contributing rather than soliciting.',
    examples: ['Try my paid course', 'Sign up for my platform with referral code'],
    negativeExamples: ['Sharing a free open-source study resource'],
    action: 'filter',
    threshold: 0.8,
    category: 'promotion',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'discount|promo code|coupon|subscribe|sign up|paid course|bootcamp deal|affiliate|referral code' },
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
  {
    id: 'common-questions',
    title: 'Common questions',
    description: 'Users are expected to search the subreddit before asking questions that have already been answered repeatedly.',
    examples: ['Is computer science cooked?', 'Should I learn Python or Java?'],
    negativeExamples: ['Nuanced discussion about language tradeoffs in a specific course'],
    action: 'flag',
    threshold: 0.76,
    category: 'repetition',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'is cs worth it|is computer science worth it|python or java|which language should i learn|am i cooked' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'ai-llms',
    title: 'AI Large Language Models',
    description:
      'AI-generated content is not allowed. AI discussion is permitted when academic or technical, but low-quality homework, job-market doomposting, and wrapper self-promotion are not.',
    examples: ['ChatGPT wrote this post for me', 'Promoting a thin AI wrapper project outside the project thread'],
    negativeExamples: ['Academic discussion about LLM applications in CS research'],
    action: 'flag',
    threshold: 0.78,
    category: 'quality',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'ai generated|generated by chatgpt|generated by gpt|generated by gemini|generated by claude|chatgpt wrote|llm wrote|wrapper project|ai wrapper' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'college-comparison',
    title: 'College comparison posts',
    description: 'College comparison posts are not allowed by default.',
    examples: ['UIUC CS vs Georgia Tech CS?', 'Help me choose between these universities'],
    negativeExamples: ['Discussing curriculum differences between two programs in depth'],
    action: 'filter',
    threshold: 0.7,
    category: 'format',
    redirectTargetType: 'subreddit',
    redirectTarget: 'r/college',
    redirectTemplate: 'College comparison questions are outside this community by default. Consider directing the author to r/college or an admissions-specific thread.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'vs\\.?|versus|between|choose|which school|which college|which university|which program' },
      { type: 'keyword', field: 'title_and_body', value: 'college|university|school|program|uiuc|gatech|georgia tech|purdue|ucsd|uw|waterloo|berkeley|cmu' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'laptop-posts',
    title: 'Laptop posts',
    description: 'Laptop recommendation posts are outside the subreddit scope.',
    examples: ['Which laptop should I buy for CS?', 'MacBook Air or ThinkPad for programming?'],
    negativeExamples: ['Discussing IDE setup on different operating systems'],
    action: 'filter',
    threshold: 0.7,
    category: 'scope',
    redirectTargetType: 'subreddit',
    redirectTarget: 'r/SuggestALaptop',
    redirectTemplate: 'Laptop buying advice usually belongs in r/SuggestALaptop or r/laptops.',
    redirect: 'Try r/SuggestALaptop or r/laptops.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'laptop|macbook|thinkpad|computer' },
      { type: 'keyword', field: 'title_and_body', value: 'buy|choose|recommend|suggest|for cs|for computer science' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'restricted-posts',
    title: 'Restricted posts',
    description:
      'Restricted topics require moderator approval: "Is CS for me", regret majoring in CS, job market is bad, UPS memes, H1B discussion, and broad DEI discussion except specific pipelines.',
    examples: ['Is CS for me?', 'I regret majoring in CS', 'H1B discourse post'],
    negativeExamples: ['Discussion about specific CS scholarship pipeline programs'],
    action: 'filter',
    threshold: 0.72,
    category: 'sensitive',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'is cs for me|regret majoring in cs|regret cs|job market is bad|market is cooked|cs is cooked|h1b|h-1b|ups meme|dei|diversity initiative' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    source: 'preset',
  },
  {
    id: 'personal-projects',
    title: 'Personal projects',
    description: 'Personal projects belong in the project showcase megathread unless the mods approve a standalone thread.',
    examples: ['I built a todo app, please try it', 'Showcasing my side project'],
    negativeExamples: ['Asking for advice on how to start a personal project'],
    action: 'filter',
    threshold: 0.72,
    category: 'megathread',
    redirectTargetType: 'megathread',
    redirectTarget: 'Project showcase megathread',
    redirectTemplate: 'Personal project showcases belong in the project showcase megathread unless moderators approve a standalone post.',
    redirect: 'Use the project showcase megathread or modmail if the project deserves its own thread.',
    enabled: true,
    conditions: [
      { type: 'keyword', field: 'title_and_body', value: 'i built|i made|my project|side project|personal project|showcase|check out my|try my' },
      { type: 'keyword', field: 'title_and_body', value: 'app|website|tool|project|extension|repo|github' },
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
