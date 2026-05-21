import { describe, expect, it } from 'vitest';

import type { ConditionType, RuleAction, RuleConfigV2, SubredditRuleInput } from '../shared/types';
import { draftRuleWithOpenAI, RuleBuilderGenerationError } from './rule-builder';

type LiveRuleAuditCase = {
  name: string;
  intent?: string | undefined;
  subredditRule?: SubredditRuleInput | undefined;
  mustHaveTypes?: ConditionType[] | undefined;
  mustNotHaveTypes?: ConditionType[] | undefined;
  semanticIncludes?: string[] | undefined;
  allowedActions?: RuleAction[] | undefined;
  day?: string | undefined;
  dayNegate?: boolean | undefined;
};

const LIVE_RULE_AUDIT_CASES: LiveRuleAuditCase[] = [
  {
    name: 'compound ragebait timing/disclaimer',
    intent: 'only allow ragebait posts on wednesdays if they put a disclaimer at the bottom of the post',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex', 'day_of_week'],
    semanticIncludes: ['Wednesday', 'disclaimer', 'Do not match'],
  },
  {
    name: 'simple timed memes',
    intent: 'only allow memes on thursdays',
    mustHaveTypes: ['day_of_week', 'semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['meme', 'Do not match'],
    day: 'Thursday',
    dayNegate: true,
  },
  {
    name: 'domain-specific URL rule',
    intent: 'remove posts linking to example.com',
    mustHaveTypes: ['url_domain'],
    mustNotHaveTypes: ['regex'],
  },
  {
    name: 'post type rule',
    intent: 'require review for link posts',
    mustHaveTypes: ['post_type'],
  },
  {
    name: 'flair rule',
    intent: 'filter posts with Hiring flair',
    mustHaveTypes: ['flair'],
  },
  {
    name: 'title length rule',
    intent: 'flag titles under 10 characters',
    mustHaveTypes: ['title_length'],
  },
  {
    name: 'body length rule',
    intent: 'filter posts with empty body under 25 characters',
    mustHaveTypes: ['body_length'],
  },
  {
    name: 'time window rule',
    intent: 'flag posts after 10pm',
    mustHaveTypes: ['time_window'],
  },
  {
    name: 'out of scope',
    intent:
      'Out of scope: This sub is for college-level CS and related majors. General college life belongs in r/college, and career/job/recruiting/interview posts belong in r/cscareerquestions.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['general college', 'career', 'computer science'],
  },
  {
    name: 'respectful engagement',
    intent: 'Respectful engagement: do not be a jerk. Offensive posts, harassment, and personal attacks are not allowed.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['personal attacks', 'Do not match', 'civil disagreement'],
  },
  {
    name: 'surveys hiring referrals approval',
    intent: 'AMAs, surveys, hiring posts, and referral requests or offers need moderator approval before posting.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['moderator approval', 'survey', 'hiring', 'referral'],
  },
  {
    name: 'resume sticky',
    intent: 'Do not make standalone resume posts. Put resume reviews in the resume sticky or megathread.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['resume', 'sticky', 'general resume advice'],
  },
  {
    name: 'amazon recommendation',
    intent: 'Amazon-related questions should go in the Amazon megathreads, but this is only a recommendation and not a hard requirement.',
    mustHaveTypes: ['keyword'],
    allowedActions: ['log', 'flag'],
  },
  {
    name: 'live OA questions',
    intent: 'Online assessments and interview questions: no discussion of live OA questions; practice questions are okay.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['active/live', 'exact questions', 'practice', 'general preparation'],
  },
  {
    name: 'spam promotion',
    intent: 'No spam or promotional posting. Useful links are fine, but marketing, click farming, and ads disguised as helpful posts are not.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['promotion', 'traffic', 'useful links'],
  },
  {
    name: 'lazy low quality',
    intent: 'Lazy or low-quality posts: remove hard-to-understand posts, title-only posts, empty-body posts, and polls with no useful context.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex', 'post_type', 'title_length', 'body_length'],
    semanticIncludes: ['missing necessary context', 'too little effort', 'concise but specific'],
  },
  {
    name: 'common questions',
    intent: 'Common questions: users should search the sub before posting questions that have already been answered many times.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['do not claim to search', 'FAQ', 'new context'],
  },
  {
    name: 'AI LLM policy',
    intent:
      'AI Large Language Models policy: LLM-generated content is not allowed, but academic or technical discussion about AI is allowed. Repetitive low-quality AI doomposting and AI wrapper self-promo are not okay.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['without claiming authorship', 'prompt', 'substantive discussion'],
  },
  {
    name: 'college comparisons',
    intent: 'College comparison posts are banned by default, like UIUC vs Purdue vs Georgia Tech standalone threads.',
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['compare', 'choose', 'one school'],
  },
  {
    name: 'laptop recommendations',
    intent: 'Laptop recommendation posts are out of scope. Send those to r/SuggestALaptop or r/laptops instead.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['buying', 'recommend', 'technical setup'],
  },
  {
    name: 'restricted posts',
    intent:
      'Restricted posts require mod approval: Is CS for me, regret majoring in CS, job market is bad, UPS memes, H1B discussion, and general DEI discussion. Grace Hopper, STEP, and Explore are exceptions.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['restricted recurring', 'H1B', 'DEI', 'Grace Hopper', 'STEP', 'Explore'],
  },
  {
    name: 'personal projects',
    intent: 'Personal project posts should go in the project showcase megathread unless the project deserves its own thread and the author modmails first.',
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['project showcase', 'generic feedback', 'substantive technical'],
  },
];

const CS_MAJORS_IMPORT_RULE_CASES: LiveRuleAuditCase[] = [
  {
    name: 'import r/csMajors out of scope',
    subredditRule: {
      title: 'Out of scope',
      description:
        'This sub is for college-level CS and related majors: computer science, computer engineering, software engineering, math, information science, and stuff in that lane. If your post is really about general college life, put it in r/college. If it is mainly about jobs, recruiting, interviews, or career stuff rather than school itself, r/cscareerquestions is the better fit.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['general college', 'career', 'computer science'],
  },
  {
    name: 'import r/csMajors respectful engagement',
    subredditRule: {
      title: 'Respectful engagement',
      description:
        'Don’t be a jerk. Offensive posts and comments are not allowed. That also applies to DMs tied to the sub, and the mods explicitly say to modmail them if someone is harassing you there.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['personal attacks', 'Do not match', 'civil disagreement'],
  },
  {
    name: 'import r/csMajors shitposts and memes',
    subredditRule: {
      title: 'Shitposts and memes',
      description:
        'Memes and shitposts are not generally allowed unless mods approve them first. The current About page also says there is a Sunday exception. Otherwise, they want that stuff somewhere like r/ProgrammerHumor.',
    },
    mustHaveTypes: ['day_of_week', 'semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['meme', 'Do not match'],
    day: 'Sunday',
    dayNegate: true,
  },
  {
    name: 'import r/csMajors AMAs surveys hiring referrals',
    subredditRule: {
      title: 'AMAs, surveys, hiring, and referrals',
      description:
        'You need mod approval before posting any AMA, survey, hiring post, or referral request/offer. For hiring, this rule is specifically about people or companies trying to recruit for their own org.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['moderator approval', 'survey', 'hiring', 'referral'],
  },
  {
    name: 'import r/csMajors resume sticky',
    subredditRule: {
      title: 'Resume sticky',
      description:
        'Don’t make standalone resume posts. Put resumes in the dedicated resume megathread, or use a sub like r/EngineeringResumes. Otherwise your post can get removed.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['resume', 'sticky', 'general resume advice'],
  },
  {
    name: 'import r/csMajors Amazon posts',
    subredditRule: {
      title: 'Amazon posts',
      description:
        'Amazon-related questions are supposed to go in the Amazon megathreads. The rule currently says this is only a recommendation, not a hard requirement, as of March 19, 2026.',
    },
    mustHaveTypes: ['keyword'],
    allowedActions: ['log', 'flag'],
  },
  {
    name: 'import r/csMajors online assessments',
    subredditRule: {
      title: 'Online assessments and interview questions',
      description:
        'You cannot discuss live OA questions. They define live as official CodeSignal assessment questions or questions currently being used in a company’s online assessment, no matter what platform the company uses. Practice questions are okay.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['active/live', 'exact questions', 'practice', 'general preparation'],
  },
  {
    name: 'import r/csMajors spam',
    subredditRule: {
      title: 'Spam',
      description:
        'No spam or promotional posting. Useful links are fine if they genuinely help the community, but if your real goal is to market something, farm clicks, or sneak in an ad disguised as a helpful post, it will probably get removed.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['promotion', 'traffic', 'useful links'],
  },
  {
    name: 'import r/csMajors lazy or low-quality',
    subredditRule: {
      title: 'Lazy or low-quality posts',
      description:
        'Posts need at least some effort. Examples include posts that are hard to understand, empty-body posts, low-effort crossposts, and poll posts with basically no context. They specifically mention which company should I choose posts that give no useful details.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex', 'post_type', 'title_length', 'body_length'],
    semanticIncludes: ['missing necessary context', 'too little effort', 'concise but specific'],
  },
  {
    name: 'import r/csMajors common questions',
    subredditRule: {
      title: 'Common questions',
      description:
        'Before posting, you are expected to search the sub and see whether your question has already been answered. If you ask something extremely repeated, that can get treated badly or removed.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['do not claim to search', 'FAQ', 'new context'],
  },
  {
    name: 'import r/csMajors AI LLMs',
    subredditRule: {
      title: 'AI Large Language Models (LLMs)',
      description:
        'LLM-generated content is not allowed. General AI discussion is allowed, especially if academic or technical, but repetitive low-quality AI questions, doomposting about AI wrecking CS or the job market, and self-promo for wrapper projects outside the project thread are not okay.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['keyword', 'regex'],
    semanticIncludes: ['without claiming authorship', 'prompt', 'substantive discussion'],
  },
  {
    name: 'import r/csMajors college comparisons',
    subredditRule: {
      title: 'College comparison posts',
      description:
        'College comparison threads are banned by default. Posts like UIUC vs Purdue vs Georgia Tech are not supposed to be normal standalone threads there anymore.',
    },
    mustHaveTypes: ['semantic'],
    mustNotHaveTypes: ['regex'],
    semanticIncludes: ['compare', 'choose', 'one school'],
  },
  {
    name: 'import r/csMajors laptop posts',
    subredditRule: {
      title: 'Laptop posts',
      description:
        'Laptop recommendation posts are considered out of scope. They want those sent to r/SuggestALaptop or r/laptops instead. This includes posts asking the community to recommend a laptop for you.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['buying', 'recommend', 'technical setup'],
  },
  {
    name: 'import r/csMajors restricted posts',
    subredditRule: {
      title: 'Restricted posts',
      description:
        'Some topics are locked down unless a mod approves them first. Examples are Is CS for me, Regret majoring in CS, Job market is bad, UPS memes, H1B-related discussion, and general DEI discussion, except for Grace Hopper Celebration or specific company pipelines such as STEP or Explore.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['restricted recurring', 'H1B', 'DEI', 'Grace Hopper', 'STEP', 'Explore'],
  },
  {
    name: 'import r/csMajors personal projects',
    subredditRule: {
      title: 'Personal projects',
      description:
        'Personal project posts are supposed to go in the project showcase megathread. The only exception is if your project genuinely deserves its own thread, and in that case they want you to modmail first.',
    },
    mustHaveTypes: ['semantic'],
    semanticIncludes: ['project showcase', 'generic feedback', 'substantive technical'],
  },
];

function conditionTypes(rule: RuleConfigV2): Set<ConditionType> {
  return new Set(rule.conditions.map((condition) => condition.type));
}

function validateLiveDraft(testCase: LiveRuleAuditCase, rule: RuleConfigV2): string | null {
  if (!rule.title.trim()) return 'Generated rule title was empty.';
  if (!rule.description.trim()) return 'Generated rule description was empty.';
  if (rule.enabled) return 'Generated rule must be disabled by default.';
  if (rule.conditions.length === 0) return 'Generated rule had no conditions.';
  const semantic = rule.conditions.find((condition) => condition.type === 'semantic');
  const types = conditionTypes(rule);
  for (const type of testCase.mustHaveTypes ?? []) {
    if (!types.has(type)) {
      return `Generated rule should include a ${type} condition. Conditions: ${JSON.stringify(rule.conditions)}`;
    }
  }
  for (const type of testCase.mustNotHaveTypes ?? []) {
    if (types.has(type)) {
      return `Generated rule should not include a ${type} condition. Conditions: ${JSON.stringify(rule.conditions)}`;
    }
  }
  if (semantic && semantic.value.length < 120) return 'Semantic condition was too short to be a useful classifier rubric.';
  for (const expected of testCase.semanticIncludes ?? []) {
    if (!semantic) return `Generated rule should include semantic guidance containing ${expected}.`;
    if (!semantic.value.toLowerCase().includes(expected.toLowerCase())) {
      return `Semantic condition should include "${expected}". Semantic: ${semantic.value}`;
    }
  }
  if (testCase.day) {
    const dayCondition = rule.conditions.find((condition) => condition.type === 'day_of_week');
    if (!dayCondition?.days?.some((day) => day.toLowerCase() === testCase.day?.toLowerCase())) {
      return `Generated day_of_week condition should include ${testCase.day}. Conditions: ${JSON.stringify(rule.conditions)}`;
    }
    if (dayCondition.negate !== testCase.dayNegate) {
      return `Generated day_of_week condition should have negate=${String(testCase.dayNegate)}. Condition: ${JSON.stringify(dayCondition)}`;
    }
  }
  if (testCase.allowedActions && !testCase.allowedActions.includes(rule.action)) {
    return `Generated rule action should be one of ${testCase.allowedActions.join(', ')}. Got ${rule.action}.`;
  }
  return null;
}

const describeLive = process.env.RULEPILOT_RUN_LIVE_OPENAI === '1' ? describe : describe.skip;

describeLive('RulePilot AI Builder live OpenAI smoke', () => {
  it.concurrent.each(LIVE_RULE_AUDIT_CASES)('drafts $name with the real OpenAI API', async (testCase) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Set OPENAI_API_KEY before running npm run test:ai-builder:live.');
    }

    let response;
    try {
      response = await draftRuleWithOpenAI({
        request: {
          mode: 'natural_language',
          intent: testCase.intent ?? testCase.name,
          timezone: 'America/Chicago',
          currentRules: [],
        },
        apiKey,
        model: process.env.RULEPILOT_OPENAI_MODEL ?? 'gpt-5-nano',
        validateDraft: (rule) => validateLiveDraft(testCase, rule),
      });
    } catch (error) {
      if (error instanceof RuleBuilderGenerationError) {
        throw new Error(`${error.message}\n${error.details.join('\n')}`);
      }
      throw error;
    }

    expect(response.status, testCase.name).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.enabled, testCase.name).toBe(false);
      expect(response.rule.conditions.length, testCase.name).toBeGreaterThan(0);
    }
  }, 180_000);

  it.concurrent.each(CS_MAJORS_IMPORT_RULE_CASES)('imports $name with the real OpenAI API', async (testCase) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Set OPENAI_API_KEY before running npm run test:ai-builder:live.');
    }

    let response;
    try {
      response = await draftRuleWithOpenAI({
        request: {
          mode: 'subreddit_rule',
          subredditRule: testCase.subredditRule,
          timezone: 'America/Chicago',
          currentRules: [],
        },
        apiKey,
        model: process.env.RULEPILOT_OPENAI_MODEL ?? 'gpt-5-nano',
        validateDraft: (rule) => validateLiveDraft(testCase, rule),
      });
    } catch (error) {
      if (error instanceof RuleBuilderGenerationError) {
        throw new Error(`${error.message}\n${error.details.join('\n')}`);
      }
      throw error;
    }

    expect(response.status, testCase.name).toBe('draft');
    if (response.status === 'draft') {
      expect(response.rule.enabled, testCase.name).toBe(false);
      expect(response.rule.conditions.length, testCase.name).toBeGreaterThan(0);
    }
  }, 180_000);
});
