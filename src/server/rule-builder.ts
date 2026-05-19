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
        modNotes: 'Generated from the RulePilot one-click template. Review the keywords and timezone before enabling.',
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
        modNotes: 'Generated from the RulePilot one-click template. Paste the active megathread URL before enabling if available.',
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
        modNotes: 'Generated from the RulePilot one-click template. Adjust approval workflow language to match this community.',
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

function builderPayload(request: RuleBuilderRequest): Record<string, unknown> {
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
      'Default action to flag unless the intent clearly asks to route/filter obvious posts.',
      'Generated rules must be disabled drafts; do not suggest bans, DMs, crawling, author-history checks, or AI-authorship detection.',
      'For redirects, fill redirectTargetType, redirectTarget, and redirectTemplate only when rerouting is explicit.',
    ],
  };
}

function normalizeCondition(input: AiConditionDraft): RuleCondition {
  const output: RuleCondition = {
    type: input.type,
    value: input.value.trim(),
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
    conditions: draft.conditions.map(normalizeCondition),
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
            'You are RulePilot AI Builder. Draft conservative subreddit moderation rules for human moderators to review. Only output the requested JSON shape.',
        },
        {
          role: 'user',
          content: JSON.stringify(builderPayload(options.request)),
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
}
