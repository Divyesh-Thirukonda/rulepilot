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

const RULE_BUILDER_SYSTEM_PROMPT = [
  'You are RulePilot AI Builder. Draft conservative subreddit moderation rules for human moderators to review.',
  'Only output the requested JSON shape.',
  'The semantic condition value is later sent to the classifier as the rule-specific detection prompt.',
  'Never write a bare semantic label like "shitpost", "spam", "rude", or "low quality".',
  'For common subreddit moderation intents, combine deterministic conditions with one narrow semantic rubric.',
  'When semantic judgment is needed, write a compact rubric with match criteria, explicit non-matches, evidence cues, and uncertainty handling.',
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

function sentenceCase(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return 'Custom moderation rule';
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function titleFromIntent(intent: string): string {
  const lower = intent.toLowerCase();
  if (/\b(ragebait|satire|shitpost|meme|joke)\b/.test(lower) && /\bsunday|weekend\b/.test(lower)) {
    return 'Timed satire and ragebait rule';
  }
  if (/\bresume|cv\b/.test(lower)) return 'Route resume posts';
  if (/\bsurvey|questionnaire|research study|participants?\b/.test(lower)) return 'Require approval for surveys';
  if (/\bhiring|referral|recruit|job opening|internship opening\b/.test(lower)) return 'Require approval for hiring and referrals';
  if (/\bhomework|assignment|solve this|answer this|code for me\b/.test(lower)) return 'Homework help must show effort';
  if (/\bai slop|low[- ]effort ai|chatgpt dump|prompt dump\b/.test(lower)) return 'Low-effort AI content';
  return sentenceCase(intent).slice(0, 80);
}

function categoryFromIntent(intent: string): RuleCategory {
  const lower = intent.toLowerCase();
  if (/\b(ragebait|satire|shitpost|meme|joke|spoiler|title|format)\b/.test(lower)) return 'format';
  if (/\brude|insult|harass|civility|respectful\b/.test(lower)) return 'civility';
  if (/\bsurvey|hiring|referral|self[- ]promotion|promo|spam|recruit\b/.test(lower)) return 'promotion';
  if (/\bresume|megathread|sticky|weekly thread\b/.test(lower)) return 'megathread';
  if (/\boff[- ]topic|out of scope|elsewhere|wrong subreddit\b/.test(lower)) return 'scope';
  if (/\boa|online assessment|interview question|exam|contest\b/.test(lower)) return 'sensitive';
  return 'quality';
}

function actionFromIntent(intent: string): RuleAction {
  const lower = intent.toLowerCase();
  if (/\bfilter|mod queue|approval|required approval|require approval|route|megathread|sticky\b/.test(lower)) return 'filter';
  if (/\blog only|monitor\b/.test(lower)) return 'log';
  if (/\ballow|approve\b/.test(lower) && !/\bonly allow|except|unless\b/.test(lower)) return 'allow';
  return 'flag';
}

function semanticRubricForIntent(intent: string): string {
  const lower = intent.toLowerCase();
  const disclaimer = /\bdisclaimer|note at the bottom|bottom of the post\b/.test(lower)
    ? ' If the rule requires a disclaimer, match when the post lacks a visible disclaimer or the disclaimer is not clearly placed where the moderator requested.'
    : '';
  const sunday = /\bsunday|sundays\b/.test(lower)
    ? ' If the rule has a Sunday exception, match posts outside Sunday in the configured subreddit timezone unless the moderator clearly intended the opposite.'
    : '';

  return [
    `Detect posts for moderator intent: "${intent}".`,
    'Match when the visible post title, body, flair, URL/domain, post type, or configured timing clearly satisfies the violation side of that intent.',
    disclaimer,
    sunday,
    'Do not match good-faith posts that only share surface keywords, meta discussion about the rule, or posts where the required exception is visibly satisfied.',
    'Evidence cues must come only from the provided post content, flair, URL/domain, post type, and local datetime. Do not infer author history or private behavior.',
    'If the rule logic is ambiguous or only partially supported by the visible post, choose needs_review or insufficient_context rather than violation.',
  ].filter(Boolean).join(' ').slice(0, 1000);
}

function fallbackConditions(intent: string): RuleCondition[] {
  const lower = intent.toLowerCase();
  const conditions: RuleCondition[] = [];

  if (/\b(ragebait|satire|shitpost|meme|joke|bait|copypasta)\b/.test(lower)) {
    conditions.push({
      type: 'keyword',
      field: 'title_and_body',
      value: 'ragebait|satire|shitpost|meme|joke|bait|copypasta|hot take',
    });
  }
  if (/\bresume|cv\b/.test(lower)) {
    conditions.push({ type: 'keyword', field: 'title_and_body', value: 'resume|cv|roast|review|feedback|rate' });
  }
  if (/\bsurvey|questionnaire|research study|participants?\b/.test(lower)) {
    conditions.push({ type: 'keyword', field: 'title_and_body', value: 'survey|questionnaire|research study|participants|google form|qualtrics' });
  }
  if (/\bdisclaimer|note at the bottom|bottom of the post\b/.test(lower)) {
    conditions.push({
      type: 'regex',
      field: 'body',
      value: '\\b(disclaimer|satire|parody|not serious|for humor|for entertainment)\\b',
      negate: true,
    });
  }
  if (/\bsunday|sundays\b/.test(lower)) {
    conditions.push({ type: 'day_of_week', value: '', days: ['Sunday'], negate: true });
  }
  conditions.push({ type: 'semantic', value: semanticRubricForIntent(intent) });
  return conditions;
}

export function buildFallbackRuleDraft(request: RuleBuilderRequest, reason?: string): RuleBuilderResponse {
  const sourceText = request.intent?.trim()
    || [request.subredditRule?.title, request.subredditRule?.description].filter(Boolean).join(': ').trim();
  if (!sourceText) {
    return {
      status: 'needs_clarification',
      questions: ['What kind of posts should this rule match?', 'What action should RulePilot suggest when it matches?'],
    };
  }

  const now = new Date().toISOString();
  const sourceTextLower = sourceText.toLowerCase();
  const rule: RuleConfigV2 = {
    id: generateRuleId(),
    title: titleFromIntent(sourceText),
    description: `Drafted from moderator intent: ${sourceText}`,
    examples: [`Example that should match: ${sourceText}`],
    negativeExamples: ['Good-faith post that discusses the topic without violating the rule.'],
    action: actionFromIntent(sourceText),
    threshold: categoryFromIntent(sourceText) === 'format' ? 0.72 : 0.76,
    category: categoryFromIntent(sourceText),
    enabled: false,
    conditions: fallbackConditions(sourceText),
    createdAt: now,
    updatedAt: now,
    source: 'custom',
    modNotes: `Fallback draft generated for moderator review${reason ? ` because ${reason}` : ''}. Test in the simulator before enabling.`,
  };

  if (/\bresume|cv\b/.test(sourceTextLower)) {
    rule.redirectTargetType = 'megathread';
    rule.redirectTarget = 'Resume sticky';
    rule.redirectTemplate = 'Please use the resume sticky thread for resume reviews.';
    rule.redirect = rule.redirectTemplate;
  }

  return { status: 'draft', rule };
}

export function buildRuleBuilderPayload(request: RuleBuilderRequest): Record<string, unknown> {
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
      'For redirects, fill redirectTargetType, redirectTarget, and redirectTemplate only when rerouting is explicit.',
    ],
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
    throw new Error('OpenAI response did not include rule draft text.');
  }
  return normalizeAiDraft(aiRuleDraft.parse(JSON.parse(text)));
}

export async function draftRuleWithOpenAI(options: {
  request: RuleBuilderRequest;
  apiKey: string;
  model: string;
}): Promise<RuleBuilderResponse> {
  if (options.request.mode === 'template' && options.request.templateId) {
    return buildTemplateRuleDraft(options.request.templateId);
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        input: [
          {
            role: 'system',
            content:
              RULE_BUILDER_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify(buildRuleBuilderPayload(options.request)),
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
      throw new Error(`OpenAI rule draft failed: ${response.status} ${body.slice(0, 300)}`);
    }
    return parseRuleBuilderResponse(await response.json());
  } catch (error) {
    return buildFallbackRuleDraft(
      options.request,
      error instanceof Error ? error.message.slice(0, 220) : 'OpenAI rule draft was unavailable'
    );
  }
}
