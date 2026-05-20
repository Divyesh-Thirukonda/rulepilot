import { z } from 'zod';

import { generateRuleId } from '../shared/rules';
import type {
  ConditionField,
  ConditionType,
  RedirectTargetType,
  RuleAction,
  RuleBuilderRequest,
  RuleBuilderResponse,
  RuleBuilderTemplateId,
  RuleCategory,
  RuleCondition,
  RuleConfigV2,
} from '../shared/types';

const CONDITION_TYPES: ConditionType[] = [
  'keyword',
  'regex',
  'post_type',
  'flair',
  'url_domain',
  'title_length',
  'body_length',
  'day_of_week',
  'time_window',
  'semantic',
];
const CONDITION_FIELDS: ConditionField[] = ['title', 'body', 'title_and_body', 'flair', 'url'];
const ACTIONS: RuleAction[] = ['allow', 'log', 'flag', 'filter'];
const CATEGORIES: RuleCategory[] = ['scope', 'civility', 'format', 'quality', 'repetition', 'promotion', 'sensitive', 'megathread'];
const REDIRECT_TARGET_TYPES: RedirectTargetType[] = ['subreddit', 'megathread', 'url', 'custom'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const AI_RULE_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'questions', 'draft'],
  properties: {
    status: {
      type: 'string',
      enum: ['needs_clarification', 'draft'],
    },
    questions: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string', maxLength: 160 },
    },
    draft: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'description',
            'examples',
            'negativeExamples',
            'action',
            'threshold',
            'category',
            'conditions',
            'redirectTargetType',
            'redirectTarget',
            'redirectTemplate',
            'modNotes',
          ],
          properties: {
            title: { type: 'string', maxLength: 120 },
            description: { type: 'string', maxLength: 1000 },
            examples: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 160 } },
            negativeExamples: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 160 } },
            action: { type: 'string', enum: ACTIONS },
            threshold: { type: 'number', minimum: 0.01, maximum: 0.99 },
            category: { type: 'string', enum: CATEGORIES },
            conditions: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'field', 'value', 'min', 'max', 'days', 'negate'],
                properties: {
                  type: { type: 'string', enum: CONDITION_TYPES },
                  field: { anyOf: [{ type: 'string', enum: CONDITION_FIELDS }, { type: 'null' }] },
                  value: { type: 'string', maxLength: 500 },
                  min: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  max: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  days: { type: 'array', items: { type: 'string', enum: DAYS } },
                  negate: { type: 'boolean' },
                },
              },
            },
            redirectTargetType: { anyOf: [{ type: 'string', enum: REDIRECT_TARGET_TYPES }, { type: 'null' }] },
            redirectTarget: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
            redirectTemplate: { anyOf: [{ type: 'string', maxLength: 1000 }, { type: 'null' }] },
            modNotes: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          },
        },
      ],
    },
  },
} as const;

const conditionDraft = z.object({
  type: z.enum(CONDITION_TYPES),
  field: z.enum(CONDITION_FIELDS).nullable(),
  value: z.string(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  days: z.array(z.enum(DAYS as [string, ...string[]])),
  negate: z.boolean(),
});

const aiRuleDraft = z.object({
  status: z.enum(['needs_clarification', 'draft']),
  questions: z.array(z.string()).default([]),
  draft: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    examples: z.array(z.string()).default([]),
    negativeExamples: z.array(z.string()).default([]),
    action: z.enum(ACTIONS),
    threshold: z.number().min(0.01).max(0.99),
    category: z.enum(CATEGORIES),
    conditions: z.array(conditionDraft).min(1),
    redirectTargetType: z.enum(REDIRECT_TARGET_TYPES).nullable(),
    redirectTarget: z.string().nullable(),
    redirectTemplate: z.string().nullable(),
    modNotes: z.string().nullable(),
  }).nullable(),
});

type AiRuleDraft = z.infer<typeof aiRuleDraft>;
type AiConditionDraft = z.infer<typeof conditionDraft>;
type AiDraftRule = NonNullable<AiRuleDraft['draft']>;
type RuleBuilderErrorStatus = 400 | 401 | 500 | 502;
type RulePlanHint = {
  name: string;
  requiredStatus?: 'draft' | undefined;
  deterministicConditionGuidance?: string[] | undefined;
  requiredSemanticCondition?: string | undefined;
  requiredConditionTypes?: ConditionType[] | undefined;
  forbiddenConditionTypes?: ConditionType[] | undefined;
  modNote?: string | undefined;
};

const RULE_BUILDER_MAX_ATTEMPTS = 4;
const RULE_BUILDER_TIMEOUT_MS = 45_000;
const RULE_BUILDER_RETRY_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

export class RuleBuilderGenerationError extends Error {
  code: string;
  details: string[];
  retryable: boolean;
  statusCode: number;

  constructor(message: string, options: {
    code: string;
    details?: string[] | undefined;
    retryable?: boolean | undefined;
    statusCode?: number | undefined;
  }) {
    super(message);
    this.name = 'RuleBuilderGenerationError';
    this.code = options.code;
    this.details = options.details ?? [];
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode ?? 502;
  }
}

const RULE_BUILDER_SYSTEM_PROMPT = [
  'You are RulePilot AI Builder. Draft conservative subreddit moderation rules for human moderators to review.',
  'Only output the requested JSON shape.',
  'The semantic condition value is later sent to the classifier as the rule-specific detection prompt.',
  'Never write a bare semantic label like "shitpost", "spam", "rude", or "low quality".',
  'For common subreddit moderation intents, combine deterministic conditions with one narrow semantic rubric.',
  'When semantic judgment is needed, write a compact rubric with match criteria, explicit non-matches, evidence cues, and uncertainty handling.',
  'Important: RulePilot conditions are AND gates before the semantic classifier runs. Do not encode OR logic or exception logic as multiple deterministic conditions that must all be true.',
  'If the user payload includes rulePlanHint.requiredSemanticCondition, you must include exactly one semantic condition whose value follows that requiredSemanticCondition.',
  'A response without a condition object where type is "semantic" is invalid whenever rulePlanHint.requiredSemanticCondition is present.',
  'A rulePlanHint overrides the generic commonModeratorIntentPlaybook.',
  'If rulePlanHint.requiredStatus is "draft", do not return needs_clarification.',
  'For rules like "only allow X on Sundays if Y", use broad deterministic preconditions for X and put the Sunday/Y exception logic inside the semantic rubric unless a single deterministic condition fully captures the violation.',
  'Example: for "only allow ragebait posts on Sundays if they include a disclaimer", use deterministic conditions for ragebait/satire cues if helpful, then a semantic rubric that matches ragebait when either the local day is not Sunday or the required disclaimer is missing. Do not add day_of_week=Sunday as a positive gate.',
].join(' ');

const COMMON_MODERATOR_INTENT_PLAYBOOK = [
  {
    intent: 'No memes, shitposts, satire, ragebait, or joke-only posts except on allowed days',
    deterministic: 'Use meme/humor/ragebait keywords, flair text, post type, day_of_week, and subreddit timezone.',
    semantic:
      'Match low-effort humor, joke-only reactions, bait, copypasta, satire/ragebait, and intentionally unserious posts. Exclude sincere questions, good-faith discussions, announcements, and meta discussion about the rule.',
  },
  {
    intent: 'No AI slop or low-effort AI content',
    deterministic: 'Use keywords such as ChatGPT, AI-generated, prompt, generated this, automated article, and obvious repeated boilerplate only as weak cues.',
    semantic:
      'Match posts that are primarily generic, mass-produced, context-free, or prompt-dump content. Do not claim authorship detection. Exclude legitimate discussion about AI tools, disclosed AI use with substantive context, and well-scoped technical questions.',
  },
  {
    intent: 'No spam, self-promotion, or promotional links',
    deterministic: 'Use URL domain, repeated CTA phrases, referral/promo keywords, link post type, and title/body link indicators.',
    semantic:
      'Match posts whose main purpose is advertising, lead capture, traffic farming, affiliate/referral promotion, or selling a product/service. Exclude neutral resource sharing with context and community-relevant discussion.',
  },
  {
    intent: 'Low-effort or lazy questions',
    deterministic: 'Use title/body length, title-only posts, question-mark heuristic, missing body, and vague phrases such as help, urgent, what should I do.',
    semantic:
      'Match posts with too little context for useful answers, no attempt shown, vague homework/career requests, or broad questions easily answered by the FAQ. Exclude concise but specific questions.',
  },
  {
    intent: 'Civility, insults, harassment, or rude engagement',
    deterministic: 'Use obvious slur/insult keywords only for high-signal cases.',
    semantic:
      'Match personal attacks, hostile insults, harassment, demeaning language toward users or groups, or inflammatory replies. Exclude criticism of ideas, policies, companies, or courses when phrased civilly.',
  },
  {
    intent: 'Surveys, research studies, questionnaires, or recruiting participants require approval',
    deterministic: 'Use survey, questionnaire, study, participants, Google Forms, Qualtrics, and recruitment keywords plus URL domains.',
    semantic:
      'Match requests for users to complete surveys, join studies, or provide research data. Exclude discussion of survey results or methodology unless recruiting participants.',
  },
  {
    intent: 'Hiring, referrals, job posts, or recruiting require approval',
    deterministic: 'Use hiring, referral, recruiting, apply, job opening, internship opening, DM me, and company-domain links.',
    semantic:
      'Match posts primarily recruiting candidates, offering referrals, collecting resumes, or advertising roles. Exclude discussion about job-search strategy or career advice.',
  },
  {
    intent: 'Resume reviews belong in a megathread',
    deterministic: 'Use resume/CV plus review/roast/feedback/rate/critique keywords.',
    semantic:
      'Match requests for individual resume review or resume roasting. Exclude general resume advice discussions and examples used for teaching.',
  },
  {
    intent: 'Homework help must show effort',
    deterministic: 'Use homework, assignment, project, answer, solve this, code for me, due tonight, and body length indicators.',
    semantic:
      'Match requests for direct answers or completed work without a visible attempt. Exclude debugging help, conceptual questions, and posts that include what the author tried.',
  },
  {
    intent: 'No live interview, online assessment, exam, or contest question sharing',
    deterministic: 'Use live OA, online assessment, interview question, exact question, exam, midterm, final, contest, and company names when present.',
    semantic:
      'Match attempts to share or request active assessment/interview/exam questions or answers. Exclude practice questions, retrospective discussion without exact questions, and policy discussion.',
  },
  {
    intent: 'Out-of-scope or off-topic posts',
    deterministic: 'Use absence/presence of community topic keywords, general college/career-only keywords, and configured redirect targets.',
    semantic:
      'Match posts clearly outside the subreddit scope. Require strong evidence and exclude posts with a reasonable connection to the community topic.',
  },
  {
    intent: 'Buying advice, laptop recommendations, or setup questions belong elsewhere',
    deterministic: 'Use laptop, MacBook, Windows, specs, RAM, GPU, monitor, keyboard, budget, buy, and recommendation keywords.',
    semantic:
      'Match consumer buying-advice posts where the main request is what to purchase. Exclude technical setup/debugging or course-specific hardware requirements.',
  },
  {
    intent: 'Common reposted questions or restricted recurring topics',
    deterministic: 'Use configured topic keywords, title/body regexes, and redirect guidance to FAQ/wiki/megathread.',
    semantic:
      'Match posts that are substantially the restricted recurring topic. Exclude adjacent posts with new evidence, unusual context, or a different core question.',
  },
  {
    intent: 'Spoilers, title formatting, or required tags',
    deterministic: 'Use flair, title regex, missing required prefix, post type, and spoiler keywords.',
    semantic:
      'Prefer deterministic checks. Use semantic only to decide whether the post contains spoiler-sensitive content when title/flair signals are incomplete.',
  },
  {
    intent: 'Personal projects, showcases, or feedback requests must meet quality rules',
    deterministic: 'Use project, showcase, feedback, built, app, GitHub, demo, launch, and URL-domain cues.',
    semantic:
      'Match project posts that are primarily drive-by promotion, lack technical/context detail, or ask for generic feedback. Exclude substantive writeups, lessons learned, and community-relevant technical discussion.',
  },
] as const;

function extractTextFromResponse(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;
  const output = record.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== 'object') continue;
        const partRecord = part as Record<string, unknown>;
        if (typeof partRecord.text === 'string') return partRecord.text;
        if (typeof partRecord.output_text === 'string') return partRecord.output_text;
      }
    }
  }
  return undefined;
}

function condition(input: RuleCondition): RuleCondition {
  return input;
}

function templateRule(templateId: RuleBuilderTemplateId, now: string): RuleConfigV2 {
  const base = {
    id: generateRuleId(),
    enabled: false,
    createdAt: now,
    updatedAt: now,
    source: 'custom' as const,
  };
  switch (templateId) {
    case 'sunday_memes':
      return {
        ...base,
        title: 'Memes only on Sundays',
        description: 'Route meme and shitpost content to review unless it is Sunday in the subreddit timezone.',
        examples: ['Me when my OS professor assigns another project', 'CS students be like meme'],
        negativeExamples: ['Sunday meme thread post', 'Serious discussion about meme culture in CS classes'],
        action: 'filter',
        threshold: 0.72,
        category: 'format',
        conditions: [
          condition({ type: 'keyword', field: 'title_and_body', value: 'meme|shitpost|starter pack|me when|pov:|be like' }),
          condition({ type: 'flair', value: 'meme|shitpost|humor|joke|funny' }),
          condition({ type: 'day_of_week', value: '', days: ['Sunday'], negate: true }),
        ],
        redirectTargetType: 'subreddit',
        redirectTarget: 'r/ProgrammerHumor',
        redirectTemplate: 'Memes and low-context humor usually belong in r/ProgrammerHumor unless this subreddit allows them today.',
        redirect: 'Memes and low-context humor usually belong in r/ProgrammerHumor unless this subreddit allows them today.',
        modNotes: 'Generated from a RulePilot built-in template. Review the keywords and timezone before enabling.',
      };
    case 'resume_megathread':
      return {
        ...base,
        title: 'Route resume posts to megathread',
        description: 'Route resume review posts to the configured resume megathread.',
        examples: ['Roast my SWE resume', 'Can someone review my internship resume?'],
        negativeExamples: ['What should a CS resume include?', 'Discussion about resume best practices'],
        action: 'filter',
        threshold: 0.7,
        category: 'megathread',
        conditions: [
          condition({ type: 'keyword', field: 'title_and_body', value: 'resume|cv' }),
          condition({ type: 'keyword', field: 'title_and_body', value: 'review|roast|feedback|rate|critique|screen' }),
        ],
        redirectTargetType: 'megathread',
        redirectTarget: 'Resume sticky',
        redirectTemplate: 'Please use the resume sticky thread for resume reviews.',
        redirect: 'Please use the resume sticky thread for resume reviews.',
        modNotes: 'Generated from a RulePilot built-in template. Paste the active megathread URL before enabling if available.',
      };
    case 'survey_approval':
      return {
        ...base,
        title: 'Surveys require approval',
        description: 'Route surveys, questionnaires, and research-study recruitment posts to moderator review.',
        examples: ['Please fill out my CS student survey', 'Participants needed for research questionnaire'],
        negativeExamples: ['Discussing survey methodology in a statistics class', 'Results from a published survey'],
        action: 'filter',
        threshold: 0.76,
        category: 'promotion',
        conditions: [
          condition({ type: 'keyword', field: 'title_and_body', value: 'survey|questionnaire|research study|participants needed|fill out|google form' }),
        ],
        redirectTargetType: 'custom',
        redirectTarget: 'Mod approval',
        redirectTemplate: 'Surveys and research recruitment posts need moderator approval before posting.',
        redirect: 'Surveys and research recruitment posts need moderator approval before posting.',
        modNotes: 'Generated from a RulePilot built-in template. Adjust approval workflow language to match this community.',
      };
  }
}

function compactRules(rules: RuleBuilderRequest['currentRules']): RuleBuilderRequest['currentRules'] {
  return rules.slice(0, 30).map((rule) => ({
    id: rule.id,
    title: rule.title,
    description: rule.description.slice(0, 500),
  }));
}

function allowedTimingFromSource(source: string): { label: string; regex: RegExp } | undefined {
  for (const day of DAYS) {
    const lower = day.toLowerCase();
    if (new RegExp(`\\b${lower}s?\\b`).test(source)) {
      return { label: day, regex: new RegExp(`\\b${lower}s?\\b`, 'i') };
    }
  }
  if (/\bweekends?\b/.test(source)) {
    return { label: 'weekend', regex: /\b(saturday|sunday|weekends?)\b/i };
  }
  return undefined;
}

function domainFromSource(source: string): string | undefined {
  const match = source.match(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
  return match?.[1]?.toLowerCase();
}

function deterministicRulePlanHint(source: string, allowedTiming: { label: string; regex: RegExp } | undefined): RulePlanHint | undefined {
  const domain = domainFromSource(source);
  if (domain && /\b(domain|url|link|website|site|from|to)\b/.test(source)) {
    return {
      name: 'url_domain_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['url_domain'],
      deterministicConditionGuidance: [
        `Add a url_domain condition for ${domain}.`,
        'Use deterministic URL domain matching instead of a regex when the moderator names a domain.',
        'Use semantic only if the moderator also asks for a subjective judgment beyond the domain match.',
      ],
    };
  }
  if (/\b(flair|tagged as|with tag)\b/.test(source)) {
    return {
      name: 'flair_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['flair'],
      deterministicConditionGuidance: [
        'Add a flair condition when the moderator references flair or a post tag.',
        'Use semantic only if the flair is a weak cue for a subjective rule.',
      ],
    };
  }
  if (/\b(link posts?|links only|text posts?|self posts?|media posts?|image posts?|video posts?|polls?|crossposts?)\b/.test(source)) {
    return {
      name: 'post_type_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['post_type'],
      deterministicConditionGuidance: [
        'Add a post_type condition when the moderator names a Reddit post type.',
        'Valid post types are text, link, media, poll, and crosspost.',
      ],
    };
  }
  if (/\btitles?\b/.test(source) && /\b(length|short|shorter|long|longer|under|over|less than|more than|minimum|maximum|\d+\s*(?:chars?|characters?|words?))\b/.test(source)) {
    return {
      name: 'title_length_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['title_length'],
      deterministicConditionGuidance: [
        'Add a title_length condition when the moderator gives a measurable title length rule.',
        'Use min or max numeric bounds instead of regex for title length.',
      ],
    };
  }
  if (/\b(body|selftext|post body)\b/.test(source) && /\b(length|empty|short|shorter|long|longer|under|over|less than|more than|minimum|maximum|\d+\s*(?:chars?|characters?|words?))\b/.test(source)) {
    return {
      name: 'body_length_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['body_length'],
      deterministicConditionGuidance: [
        'Add a body_length condition when the moderator gives a measurable body length rule.',
        'Use min or max numeric bounds instead of regex for body length.',
      ],
    };
  }
  if (allowedTiming && !/\b(disclaimer|bottom of the post|bottom-of-post|note at the bottom)\b/.test(source)) {
    return {
      name: 'day_of_week_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['day_of_week'],
      deterministicConditionGuidance: [
        `Add a day_of_week condition for ${allowedTiming.label}.`,
        'For "only allow X on this day" rules, use negate=true so the rule matches posts outside the allowed day.',
        'Do not hide simple day-only logic only inside the semantic condition.',
      ],
    };
  }
  if (/\b(time window|between|after|before|\d{1,2}\s*(?:am|pm)|\d{1,2}:\d{2})\b/.test(source)) {
    return {
      name: 'time_window_condition',
      requiredStatus: 'draft',
      requiredConditionTypes: ['time_window'],
      deterministicConditionGuidance: [
        'Add a time_window condition when the moderator names a concrete local time range.',
        'Use the subreddit timezone setting; min/max are local hours in 24-hour time.',
      ],
    };
  }
  return undefined;
}

function rulePlanHint(request: RuleBuilderRequest): RulePlanHint | undefined {
  const source = [request.intent, request.subredditRule?.title, request.subredditRule?.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const allowedTiming = allowedTimingFromSource(source);
  if (
    /\bonly allow\b/.test(source) &&
    /\b(ragebait|satire|shitpost|meme|joke|bait)\b/.test(source) &&
    allowedTiming &&
    /\b(disclaimer|bottom of the post|bottom-of-post|note at the bottom)\b/.test(source)
  ) {
    return {
      name: 'timed_content_with_required_disclaimer',
      requiredStatus: 'draft',
      forbiddenConditionTypes: ['day_of_week'],
      deterministicConditionGuidance: [
        'Use only broad preconditions for ragebait/satire/meme-like content, such as keyword, flair, or post_type when useful.',
        'Do not add day_of_week as a deterministic condition for this rule.',
        'Do not add a negated disclaimer regex as a deterministic condition for this rule.',
        `Reason: RulePilot deterministic conditions are ANDed, but this rule is violation = content matches AND (not ${allowedTiming.label} OR missing disclaimer).`,
      ],
      requiredSemanticCondition:
        `Add exactly one semantic condition. Its value must explicitly include "${allowedTiming.label}" and "disclaimer". It must say: Detect ragebait/satire-like posts. Match when the post is ragebait/satire/bait and either the local subreddit timing is not ${allowedTiming.label} or the post body does not end with a clear disclaimer. Do not match sincere posts, meta discussion, non-ragebait content, or ${allowedTiming.label} ragebait/satire posts that include a clear bottom-of-post disclaimer. Evidence cues must include title/body/flair and local datetime only. If the day or disclaimer placement is unclear, choose needs_review.`,
      modNote:
        'RulePilot kept the timing/disclaimer exception inside the semantic rubric because RulePilot conditions are ANDed. Adding a day_of_week condition would miss one of the violation paths.',
    };
  }
  if (/\b(ai slop|low[- ]effort ai|chatgpt dump|prompt dump|generated slop)\b/.test(source)) {
    return {
      name: 'low_effort_ai_content',
      requiredStatus: 'draft',
      deterministicConditionGuidance: [
        'Use AI-related keywords only as weak preconditions when useful.',
        'Do not use only deterministic conditions; this rule requires one semantic condition.',
        'Do not draft a meme, shitpost, satire, or ragebait rule for this intent.',
        'Do not claim AI-authorship detection.',
      ],
      requiredSemanticCondition:
        'Add exactly one condition object with type "semantic". Its value must say: Detect low-effort AI content without claiming authorship detection. Match posts that are primarily generic, context-free, mass-produced, prompt-dump, pasted model output, or AI-wrapper spam with little original context. Do not match substantive discussion about AI tools, disclosed AI use with meaningful context, technical AI questions, or well-scoped examples. Evidence cues must come only from title, body, flair, URL/domain, and post type. If uncertain, choose needs_review or insufficient_context.',
    };
  }
  if (/\b(live oa|live online assessment|online assessment questions?|interview questions?|exam questions?)\b/.test(source)) {
    return {
      name: 'live_assessment_question_sharing',
      requiredStatus: 'draft',
      deterministicConditionGuidance: [
        'Use assessment/interview/exam keywords as preconditions when useful.',
        'Do not rely only on keywords; practice and retrospective discussion can share the same words.',
      ],
      requiredSemanticCondition:
        'Add exactly one semantic condition. Its value must explicitly include active/live assessment, exact questions, practice, retrospective, and general preparation. It must say: Detect requests to share, solve, or solicit active/live online assessment, interview, exam, or contest questions or answers. Match when the author appears to ask for or provide exact live assessment content. Do not match practice questions, retrospective discussion without exact questions, general preparation advice, or policy discussion. Evidence cues must come from title, body, flair, URL/domain, post type, and local datetime only. If live/active status is unclear, choose needs_review.',
    };
  }
  return deterministicRulePlanHint(source, allowedTiming);
}

export function buildRuleBuilderPayload(request: RuleBuilderRequest, retryInstruction?: string): Record<string, unknown> {
  return {
    task: 'Draft one disabled RulePilot rule for moderator review.',
    mode: request.mode,
    intent: request.intent,
    templateId: request.templateId,
    subredditRule: request.subredditRule,
    timezone: request.timezone,
    currentRules: compactRules(request.currentRules),
    constraints: [
      'Return needs_clarification when the moderator intent is too vague to draft one rule safely.',
      'Use deterministic conditions whenever possible: keyword, regex, post_type, flair, url_domain, title/body length, day_of_week, or time_window.',
      'Use semantic only for the narrow ambiguous part that deterministic conditions cannot express.',
      'Semantic condition values must be classifier-ready rubrics, not labels. Include what to match, what not to match, visible evidence cues, and what to do when uncertain.',
      'Use the commonModeratorIntentPlaybook when the moderator wording is close to one of those patterns. It is guidance, not a fixed list.',
      'For common intents, draft a conservative rule instead of asking for clarification. Ask clarification only when the audience, allowed exception, action, or target is required and unknowable.',
      'Default action to flag unless the intent clearly asks to route/filter obvious posts.',
      'Generated rules must be disabled drafts; do not suggest bans, DMs, crawling, author-history checks, or AI-authorship detection.',
      'Keep title, description, examples, and condition values concise enough to fit in one complete JSON response.',
      'For redirects, fill redirectTargetType, redirectTarget, and redirectTemplate only when rerouting is explicit.',
      'When rulePlanHint is present, it overrides generic guidance. Follow rulePlanHint.requiredSemanticCondition exactly enough that a validator can see the required rubric in the semantic condition value.',
      'When rulePlanHint.requiredSemanticCondition is present, the draft must contain exactly one condition with type semantic.',
      'When rulePlanHint.requiredConditionTypes is present, the draft must include each listed deterministic condition type unless the retry instruction says otherwise.',
      'When rulePlanHint.forbiddenConditionTypes is present, do not include those condition types.',
      'When rulePlanHint.requiredStatus is draft, the moderator intent is specific enough; return a disabled draft instead of clarification questions.',
      'Remember that RulePilot conditions are ANDed. For exception logic involving "only allow", "unless", "except", or "if", avoid deterministic conditions that accidentally require every violation path at once. Put complex boolean logic in the semantic rubric.',
      'For "only allow X on <day/time> if Y" style rules, the semantic rubric must explicitly mention the allowed day/time, the required condition, what counts as missing the condition, and that nonmatching allowed cases should not be flagged.',
    ],
    retryInstruction,
    rulePlanHint: rulePlanHint(request),
    commonModeratorIntentPlaybook: COMMON_MODERATOR_INTENT_PLAYBOOK,
    semanticConditionGuidance: {
      purpose: 'The condition.value for type=semantic becomes the future LLM classifier prompt for this rule.',
      requiredShape: 'Detect posts for this rule. Match when: ... Do not match when: ... Evidence cues: ... If uncertain: choose needs_review or insufficient_context.',
      avoid: ['single-word labels', 'community-insider shorthand without explanation', 'claims based on author intent or author history'],
      exampleForNoShitposts:
        'Detect low-effort humor or shitposts. Match when the post is primarily a meme, joke-only reaction, copypasta, bait, intentionally unserious prompt, or low-context humor rather than a substantive community discussion. Do not match sincere questions, announcements, meta discussion about the rule, or posts that only use casual wording. Evidence cues should come from title, body, flair, URL, post type, and timing only. If the post could reasonably be good-faith, use needs_review.',
    },
  };
}

function semanticConditionNeedsExpansion(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length < 80) return true;
  return !/\b(match|detect|do not match|exclude|evidence|cue|uncertain|needs_review|insufficient_context)\b/i.test(normalized);
}

function compactSentenceList(items: string[], fallback: string): string {
  const value = items.map((item) => item.trim()).filter(Boolean).slice(0, 3).join('; ');
  return value || fallback;
}

function expandedSemanticRubric(input: AiConditionDraft, draft: AiDraftRule): string {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const focus = input.value.trim();
  const positiveExamples = compactSentenceList(draft.examples, 'posts that clearly fit the rule description');
  const negativeExamples = compactSentenceList(draft.negativeExamples, 'good-faith, on-topic posts that only share surface wording with the rule');

  return [
    `Detect posts for rule "${title}".`,
    `Match when: ${description}${focus ? ` Specific focus: ${focus}.` : ''}`,
    `Positive examples: ${positiveExamples}.`,
    `Do not match when: ${negativeExamples}.`,
    'Evidence cues must come only from the post title, body, flair, URL/domain, post type, and configured timing.',
    'If the evidence is weak, joking but still substantive, or missing necessary context, choose needs_review or insufficient_context rather than violation.',
  ].join(' ').slice(0, 1000);
}

function normalizeCondition(input: AiConditionDraft, draft: AiDraftRule): RuleCondition {
  const output: RuleCondition = {
    type: input.type,
    value: input.type === 'semantic' && semanticConditionNeedsExpansion(input.value)
      ? expandedSemanticRubric(input, draft)
      : input.value.trim(),
  };
  if (input.field) output.field = input.field;
  if (input.min !== null) output.min = input.min;
  if (input.max !== null) output.max = input.max;
  if (input.days.length > 0) output.days = input.days;
  if (input.negate) output.negate = input.negate;
  return output;
}

function normalizeAiDraft(parsed: AiRuleDraft): RuleBuilderResponse {
  if (parsed.status === 'needs_clarification' || !parsed.draft) {
    return {
      status: 'needs_clarification',
      questions: parsed.questions.slice(0, 3),
    };
  }
  const now = new Date().toISOString();
  const draft = parsed.draft;
  const rule: RuleConfigV2 = {
    id: generateRuleId(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    examples: draft.examples.map((item) => item.trim()).filter(Boolean),
    negativeExamples: draft.negativeExamples.map((item) => item.trim()).filter(Boolean),
    action: draft.action,
    threshold: draft.threshold,
    category: draft.category,
    enabled: false,
    conditions: draft.conditions.map((condition) => normalizeCondition(condition, draft)),
    createdAt: now,
    updatedAt: now,
    source: 'custom',
  };
  if (draft.redirectTargetType && draft.redirectTarget?.trim() && draft.redirectTemplate?.trim()) {
    rule.redirectTargetType = draft.redirectTargetType;
    rule.redirectTarget = draft.redirectTarget.trim();
    rule.redirectTemplate = draft.redirectTemplate.trim();
    rule.redirect = draft.redirectTemplate.trim();
  }
  if (draft.modNotes?.trim()) {
    rule.modNotes = draft.modNotes.trim();
  }
  return { status: 'draft', rule };
}

export function buildTemplateRuleDraft(templateId: RuleBuilderTemplateId): RuleBuilderResponse {
  return { status: 'draft', rule: templateRule(templateId, new Date().toISOString()) };
}

export function parseRuleBuilderResponse(payload: unknown): RuleBuilderResponse {
  const text = extractTextFromResponse(payload);
  if (!text) {
    throw new RuleBuilderGenerationError('OpenAI returned an empty Rule Builder response.', {
      code: 'openai_empty_response',
      details: ['The Responses API result did not include output_text or a text content part.'],
      retryable: true,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new RuleBuilderGenerationError('OpenAI returned malformed JSON for the rule draft.', {
      code: 'openai_invalid_json',
      details: [
        error instanceof Error ? error.message : String(error),
        `Response excerpt: ${text.slice(0, 300)}`,
      ],
      retryable: true,
    });
  }

  const parsed = aiRuleDraft.safeParse(json);
  if (!parsed.success) {
    throw new RuleBuilderGenerationError('OpenAI returned JSON that did not match the RulePilot draft schema.', {
      code: 'openai_schema_mismatch',
      details: formatZodIssues(parsed.error),
      retryable: true,
    });
  }

  return normalizeAiDraft(parsed.data);
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'response';
    return `${path}: ${issue.message}`;
  });
}

function parseOpenAiErrorBody(body: string): string {
  if (!body.trim()) {
    return 'OpenAI returned an empty error body.';
  }
  try {
    const json = JSON.parse(body) as { error?: { message?: string; type?: string; code?: string } };
    const error = json.error;
    if (error?.message) {
      return [
        error.message,
        error.type ? `type=${error.type}` : '',
        error.code ? `code=${error.code}` : '',
      ].filter(Boolean).join(' ');
    }
  } catch {
    // Fall through to body excerpt.
  }
  return body.slice(0, 500);
}

function toRuleBuilderError(error: unknown): RuleBuilderGenerationError {
  if (error instanceof RuleBuilderGenerationError) {
    return error;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RuleBuilderGenerationError(`OpenAI did not respond within ${RULE_BUILDER_TIMEOUT_MS / 1000} seconds.`, {
      code: 'openai_timeout',
      details: ['The request timed out before RulePilot received a structured draft.'],
      retryable: true,
    });
  }
  return new RuleBuilderGenerationError('Rule Builder hit an unexpected server error.', {
    code: 'rule_builder_unexpected_error',
    details: [error instanceof Error ? error.message : String(error)],
    retryable: false,
    statusCode: 500,
  });
}

function retryDelayMs(attempt: number): number {
  return attempt === 1 ? 350 : 900;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestOpenAiRuleDraft(options: {
  request: RuleBuilderRequest;
  apiKey: string;
  model: string;
  retryInstruction?: string | undefined;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RULE_BUILDER_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_output_tokens: 8192,
        reasoning: { effort: 'low' },
        input: [
          {
            role: 'system',
            content: RULE_BUILDER_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify(buildRuleBuilderPayload(options.request, options.retryInstruction)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'rulepilot_rule_builder',
            strict: true,
            schema: AI_RULE_DRAFT_SCHEMA,
          },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      const requestId = response.headers.get('x-request-id');
      const details = [
        `OpenAI status: ${response.status}`,
        parseOpenAiErrorBody(body),
        requestId ? `OpenAI request id: ${requestId}` : '',
      ].filter(Boolean);
      throw new RuleBuilderGenerationError(
        response.status === 401
          ? 'OpenAI rejected the RulePilot API key.'
          : response.status === 400
            ? 'OpenAI rejected the Rule Builder request.'
            : `OpenAI Rule Builder request failed with status ${response.status}.`,
        {
          code: `openai_http_${response.status}`,
          details,
          retryable: RULE_BUILDER_RETRY_STATUSES.has(response.status),
          statusCode: response.status === 401 ? 401 : 502,
        }
      );
    }
    return response.json();
  } catch (error) {
    throw toRuleBuilderError(error);
  } finally {
    clearTimeout(timeout);
  }
}

function sourceTextForRequest(request: RuleBuilderRequest): string {
  return [
    request.intent,
    request.subredditRule?.title,
    request.subredditRule?.description,
  ].filter(Boolean).join(' ').toLowerCase();
}

function conditionMentionsDisclaimer(condition: RuleCondition): boolean {
  return /\b(disclaimer|satire|parody|not serious|humou?r|entertainment)\b/i.test(condition.value);
}

function annotateDraftForPlan(response: RuleBuilderResponse, request: RuleBuilderRequest): RuleBuilderResponse {
  if (response.status !== 'draft') {
    return response;
  }
  const plan = rulePlanHint(request);
  if (!plan?.modNote) {
    return response;
  }
  const existing = response.rule.modNotes?.trim();
  if (existing?.includes(plan.modNote)) {
    return response;
  }
  return {
    ...response,
    rule: {
      ...response.rule,
      modNotes: existing ? `${existing}\n\n${plan.modNote}` : plan.modNote,
    },
  };
}

function reviewDraftLogic(response: RuleBuilderResponse, request: RuleBuilderRequest): string | null {
  const plan = rulePlanHint(request);
  if (response.status !== 'draft') {
    if (plan?.requiredStatus === 'draft') {
      return 'This moderator intent has a specific RulePilot plan, so the builder should return a disabled draft instead of needs_clarification.';
    }
    return null;
  }
  const requiredSemanticCondition =
    plan && typeof plan.requiredSemanticCondition === 'string' ? plan.requiredSemanticCondition : undefined;
  const semanticConditions = response.rule.conditions.filter((condition) => condition.type === 'semantic');
  if (requiredSemanticCondition && semanticConditions.length !== 1) {
    return 'This moderator intent requires exactly one semantic condition. Deterministic checks may be included as weak preconditions, but they cannot replace the semantic classifier rubric.';
  }
  const requiredConditionTypes = plan?.requiredConditionTypes ?? [];
  const missingConditionType = requiredConditionTypes.find((type) =>
    !response.rule.conditions.some((condition) => condition.type === type)
  );
  if (missingConditionType) {
    return `This moderator intent requires a ${missingConditionType} deterministic condition. Add that condition type instead of relying only on regex or semantic text.`;
  }
  const forbiddenConditionType = plan?.forbiddenConditionTypes?.find((type) =>
    response.rule.conditions.some((condition) => condition.type === type)
  );
  if (forbiddenConditionType) {
    return `This moderator intent should not use a ${forbiddenConditionType} deterministic condition because it would encode compound exception logic incorrectly. Put that part in the semantic rubric.`;
  }
  const sourceText = sourceTextForRequest(request);
  const allowedTiming = allowedTimingFromSource(sourceText);
  const isOnlyAllowExceptionRule =
    /\bonly allow\b/.test(sourceText) &&
    Boolean(allowedTiming) &&
    /\b(disclaimer|note at the bottom|bottom of the post)\b/.test(sourceText);
  if (!isOnlyAllowExceptionRule) {
    return null;
  }

  const hasNegatedSundayGate = response.rule.conditions.some((condition) =>
    condition.type === 'day_of_week' &&
    condition.negate &&
    condition.days?.some((day) => allowedTiming?.regex.test(day))
  );
  const hasNegatedDisclaimerGate = response.rule.conditions.some((condition) =>
    condition.negate && conditionMentionsDisclaimer(condition)
  );
  if (hasNegatedSundayGate && hasNegatedDisclaimerGate) {
    return [
      'The generated conditions encode exception logic incorrectly.',
      `RulePilot evaluates deterministic conditions as AND gates, so combining "not ${allowedTiming?.label ?? 'allowed time'}" and "missing disclaimer" would only catch posts that satisfy both conditions.`,
      'For this intent, use a broad ragebait/satire precondition and put the timing/disclaimer requirement in the semantic rubric.',
    ].join(' ');
  }

  const semanticRubric = semanticConditions[0]?.value ?? '';
  if (!/\b(disclaimer|exception|allowed)\b/i.test(semanticRubric) || (allowedTiming && !allowedTiming.regex.test(semanticRubric))) {
    return `The semantic rubric does not explain the ${allowedTiming?.label ?? 'timing'}/disclaimer exception, so the classifier would not know how to apply the rule.`;
  }
  return null;
}

function retryInstructionFor(error: RuleBuilderGenerationError, attempt: number, request: RuleBuilderRequest): string {
  const plan = rulePlanHint(request);
  return [
    `Previous attempt ${attempt} failed: ${error.message}`,
    ...error.details.slice(0, 5),
    plan?.requiredSemanticCondition
      ? `This retry will be rejected unless the draft includes exactly one semantic condition that follows this requirement: ${plan.requiredSemanticCondition}`
      : '',
    plan?.requiredConditionTypes?.length
      ? `This retry will be rejected unless the draft includes these deterministic condition types: ${plan.requiredConditionTypes.join(', ')}.`
      : '',
    plan?.forbiddenConditionTypes?.length
      ? `Do not include these condition types in the retry: ${plan.forbiddenConditionTypes.join(', ')}.`
      : '',
    'Regenerate the rule from scratch as one strict JSON response.',
    'Do not repeat the invalid structure.',
    'If the issue mentions AND gates, move exception logic into the semantic rubric and keep deterministic conditions broad.',
  ].filter(Boolean).join('\n').slice(0, 3200);
}

export function ruleBuilderErrorResponse(error: unknown): {
  body: { error: string; code: string; details: string[]; retryable: boolean };
  status: RuleBuilderErrorStatus;
} {
  const normalized = toRuleBuilderError(error);
  const status: RuleBuilderErrorStatus =
    normalized.statusCode === 400 ||
    normalized.statusCode === 401 ||
    normalized.statusCode === 500 ||
    normalized.statusCode === 502
      ? normalized.statusCode
      : 502;
  return {
    body: {
      error: normalized.message,
      code: normalized.code,
      details: normalized.details,
      retryable: normalized.retryable,
    },
    status,
  };
}

export async function draftRuleWithOpenAI(options: {
  request: RuleBuilderRequest;
  apiKey: string;
  model: string;
  validateDraft?: ((rule: RuleConfigV2) => string | null) | undefined;
}): Promise<RuleBuilderResponse> {
  if (options.request.mode === 'template' && options.request.templateId) {
    return buildTemplateRuleDraft(options.request.templateId);
  }

  const attemptDetails: string[] = [];
  let retryInstruction: string | undefined;

  for (let attempt = 1; attempt <= RULE_BUILDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await requestOpenAiRuleDraft({
        request: options.request,
        apiKey: options.apiKey,
        model: options.model,
        retryInstruction,
      });
      const result = parseRuleBuilderResponse(payload);
      const logicError = reviewDraftLogic(result, options.request);
      const validationError = result.status === 'draft' ? options.validateDraft?.(result.rule) ?? null : null;
      if (logicError || validationError) {
        throw new RuleBuilderGenerationError('OpenAI generated a draft that RulePilot could not safely accept.', {
          code: 'invalid_generated_rule',
          details: [logicError, validationError].filter((detail): detail is string => Boolean(detail)),
          retryable: true,
        });
      }
      return annotateDraftForPlan(result, options.request);
    } catch (error) {
      const normalized = toRuleBuilderError(error);
      attemptDetails.push(
        `Attempt ${attempt}: ${normalized.message}${normalized.details[0] ? ` (${normalized.details[0]})` : ''}`
      );
      if (!normalized.retryable || attempt === RULE_BUILDER_MAX_ATTEMPTS) {
        throw new RuleBuilderGenerationError(
          attempt === 1
            ? normalized.message
            : `Rule Builder could not draft a valid rule after ${attempt} attempts.`,
          {
            code: normalized.code,
            details: [...attemptDetails, ...normalized.details].slice(0, 10),
            retryable: false,
            statusCode: normalized.statusCode,
          }
        );
      }
      retryInstruction = retryInstructionFor(normalized, attempt, options.request);
      await wait(retryDelayMs(attempt));
    }
  }

  throw new RuleBuilderGenerationError('Rule Builder exhausted all attempts without producing a draft.', {
    code: 'rule_builder_attempts_exhausted',
    details: attemptDetails,
    retryable: false,
  });
}
