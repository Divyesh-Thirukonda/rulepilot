import { describe, expect, it } from 'vitest';

import type { ConditionType, RuleAction, RuleConfigV2 } from '../shared/types';
import { draftRuleWithOpenAI, RuleBuilderGenerationError } from './rule-builder';

type LiveRuleAuditCase = {
  name: string;
  intent: string;
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
          intent: testCase.intent,
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
