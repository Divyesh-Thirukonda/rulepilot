import { z } from 'zod';

import { suggestedActionForRoutingAction } from '../shared/actions';
import type { ClassificationEvidence, ClassificationResult, PostInput, RuleConfigV2 } from '../shared/types';
import { evaluateCondition } from './heuristics';

const EVIDENCE_FIELDS: ClassificationEvidence['field'][] = [
  'title',
  'body',
  'flair',
  'url',
  'post_type',
  'datetime',
  'quality',
  'rule',
  'other',
];

function openAIClassificationSchema(rules: RuleConfigV2[]) {
  const ruleIds = rules.map((rule) => rule.id);
  const ruleIdSchema = ruleIds.length > 0
    ? { anyOf: [{ type: 'string', enum: ruleIds }, { type: 'null' }] }
    : { anyOf: [{ type: 'string' }, { type: 'null' }] };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'ruleId', 'confidence', 'rationale', 'suggestedAction', 'matchedSignals', 'evidence', 'actionReason'],
    properties: {
      decision: {
        type: 'string',
        enum: ['allowed', 'needs_review', 'violation', 'uncertain', 'insufficient_context'],
      },
      ruleId: ruleIdSchema,
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      rationale: {
        type: 'string',
        maxLength: 600,
      },
      suggestedAction: {
        type: 'string',
        enum: ['allow', 'log', 'flag_for_review', 'filter_to_modqueue'],
      },
      matchedSignals: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'string',
          maxLength: 120,
        },
      },
      evidence: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'excerpt', 'note'],
          properties: {
            field: { type: 'string', enum: EVIDENCE_FIELDS },
            excerpt: { anyOf: [{ type: 'string', maxLength: 180 }, { type: 'null' }] },
            note: { type: 'string', maxLength: 180 },
          },
        },
      },
      actionReason: {
        type: 'string',
        maxLength: 180,
      },
    },
  } as const;
}

const llmClassification = z.object({
  decision: z.enum(['allowed', 'needs_review', 'violation', 'uncertain', 'insufficient_context']),
  ruleId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  suggestedAction: z.enum(['allow', 'log', 'flag_for_review', 'filter_to_modqueue']),
  matchedSignals: z.array(z.string()).default([]),
  evidence: z.array(z.object({
    field: z.enum(EVIDENCE_FIELDS),
    excerpt: z.string().nullable(),
    note: z.string(),
  })).default([]),
  actionReason: z.string().default(''),
});

function extractTextFromResponse(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') {
    return record.output_text;
  }
  const output = record.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (!part || typeof part !== 'object') {
          continue;
        }
        const partRecord = part as Record<string, unknown>;
        if (typeof partRecord.text === 'string') {
          return partRecord.text;
        }
        if (typeof partRecord.output_text === 'string') {
          return partRecord.output_text;
        }
      }
    }
  }
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (first && typeof first === 'object') {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === 'object') {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === 'string') {
          return content;
        }
      }
    }
  }
  return undefined;
}

export function parseOpenAIClassificationResponse(payload: unknown): ClassificationResult {
  const text = extractTextFromResponse(payload);
  if (!text) {
    throw new Error('OpenAI response did not include classification text.');
  }
  const parsed = llmClassification.parse(JSON.parse(text));
  const evidence = parsed.evidence.map((item) => ({
    field: item.field,
    ...(item.excerpt ? { excerpt: item.excerpt } : {}),
    note: item.note,
  }));
  const matchedSignals = parsed.matchedSignals.length > 0
    ? parsed.matchedSignals
    : evidence.map((item) => item.excerpt ? `${item.field}: ${item.excerpt}` : `${item.field}: ${item.note}`);
  return {
    decision: parsed.decision,
    ruleId: parsed.ruleId,
    confidence: parsed.confidence,
    rationale: parsed.rationale,
    suggestedAction: parsed.suggestedAction,
    matchedSignals,
    evidence,
    actionReason: parsed.actionReason,
    source: 'llm',
  };
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function weekdayInTimezone(date: Date | undefined, timezone: string): string | undefined {
  if (!date) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(date);
  }
}

function localTimeInTimezone(date: Date | undefined, timezone: string): string | undefined {
  if (!date) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
}

function qualityIndicators(post: PostInput): Record<string, boolean | number> {
  const title = post.title ?? '';
  const body = post.body ?? '';
  const combined = `${title}\n${body}`;
  const words = combined.trim().split(/\s+/).filter(Boolean);
  return {
    titleLength: title.trim().length,
    bodyLength: body.trim().length,
    titleWordCount: title.trim().split(/\s+/).filter(Boolean).length,
    bodyWordCount: body.trim().split(/\s+/).filter(Boolean).length,
    totalWordCount: words.length,
    hasQuestionMark: combined.includes('?'),
    hasUrl: /https?:\/\/|www\./i.test(combined) || Boolean(post.url),
    hasMediaUrl: /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)(?:\?|$)/i.test(post.url ?? ''),
    hasCodeBlock: /```| {4}\S/.test(combined),
    hasListFormatting: /(^|\n)\s*[-*]\s+\S/.test(combined),
    isTitleOnly: title.trim().length > 0 && body.trim().length === 0,
  };
}

function postForModel(post: PostInput, timezone: string): Record<string, unknown> {
  const title = post.title.trim();
  const body = post.body?.trim() ?? '';
  const urlDomain = post.url ? safeDomain(post.url) : undefined;
  return {
    postId: post.id,
    subredditName: post.subredditName,
    title,
    titleExcerpt: title.slice(0, 300),
    bodyExcerpt: body.slice(0, 3500),
    flairText: post.flairText,
    urlDomain,
    hasOutboundUrl: Boolean(urlDomain),
    postType: post.postType,
    createdAtUtc: post.createdAt?.toISOString(),
    createdWeekday: weekdayInTimezone(post.createdAt, timezone),
    createdLocalTime: localTimeInTimezone(post.createdAt, timezone),
    timezone,
    qualityIndicators: qualityIndicators(post),
  };
}

function ruleForModel(rule: RuleConfigV2): Record<string, unknown> {
  const semanticConditions = rule.conditions.filter((condition) => condition.type === 'semantic');
  const deterministicConditions = rule.conditions.filter((condition) => condition.type !== 'semantic');
  return {
    id: rule.id,
    title: rule.title,
    description: rule.description,
    action: rule.action,
    suggestedActionForViolation: suggestedActionForRoutingAction(rule.action),
    threshold: rule.threshold,
    category: rule.category,
    examples: rule.examples,
    negativeExamples: rule.negativeExamples.length > 0 ? rule.negativeExamples : undefined,
    redirectTargetType: rule.redirectTargetType,
    redirectTarget: rule.redirectTarget,
    redirectTemplate: rule.redirectTemplate,
    redirect: rule.redirect,
    semanticRubrics: semanticConditions.map((condition) => condition.value),
    deterministicConditionCount: deterministicConditions.length,
    conditions: rule.conditions.map((c) => ({
      type: c.type,
      field: c.field,
      value: c.value,
      negate: c.negate || undefined,
      days: c.days,
      min: c.min,
      max: c.max,
    })),
    modNotes: rule.modNotes || undefined,
  };
}

function precheckForRule(post: PostInput, rule: RuleConfigV2, timezone: string, now: Date): Record<string, unknown> {
  const deterministicConditions = rule.conditions.filter((condition) => condition.type !== 'semantic');
  const conditionResults = deterministicConditions.map((condition, index) => {
    const result = evaluateCondition(post, condition, timezone, now);
    const effectiveMatch = condition.negate ? !result.matched : result.matched;
    return {
      conditionIndex: index,
      type: condition.type,
      field: condition.field,
      negated: Boolean(condition.negate),
      matched: effectiveMatch,
      rawMatched: result.matched,
      signal: result.signal || null,
    };
  });
  const deterministicPreconditionsPass = conditionResults.length === 0 ||
    conditionResults.every((result) => result.matched);
  const matchedSignals = conditionResults
    .filter((result) => result.matched && result.signal)
    .map((result) => result.negated ? `NOT ${result.signal}` : result.signal);

  return {
    ruleId: rule.id,
    deterministicPreconditionsPass,
    hasSemanticConditions: rule.conditions.some((condition) => condition.type === 'semantic'),
    matchedSignals,
    conditionResults,
  };
}

export function buildOpenAIClassificationInput(options: {
  post: PostInput;
  rules: RuleConfigV2[];
  timezone: string;
  now?: Date | undefined;
}): Record<string, unknown> {
  const now = options.now ?? options.post.createdAt ?? new Date();
  return {
    task: 'Classify this post against enabled subreddit rules only.',
    rubric: [
      'Be conservative. Choose violation only when the post clearly matches a provided rule.',
      'Use needs_review for likely issues that need moderator judgment.',
      'Use insufficient_context when the post lacks enough evidence to classify a rule violation.',
      'Use allowed when no provided rule applies.',
      'Return short evidence bullets in matchedSignals and structured evidence objects. Quote or summarize only text visible in the provided post payload.',
      'Do not infer author intent, identity, history, private profile data, or cross-subreddit behavior.',
      'For AI/LLM policy rules, classify the policy topic only. Do not claim authorship detection or say text is AI-generated unless the post itself says so.',
      'Use enabledRules[].action only as the moderator-configured routing intent. Do not invent bans, DMs, removals, or crossposts.',
      'If decision is allowed, uncertain, or insufficient_context, ruleId should be null unless one specific rule explains the uncertainty.',
      'If deterministicPrechecks show failed deterministic preconditions, treat that as evidence against the rule unless the rule description/mod notes explicitly call for semantic fallback.',
    ],
    calibration: {
      outOfScope: 'Require strong evidence that the post is not about CS education before choosing violation.',
      lowQuality: 'Default to needs_review unless the low-effort signal is obvious from length/context indicators.',
      memes: 'Meme/shitpost can be high confidence when flair or explicit meme language is present.',
      aiLlms: 'Evaluate whether the topic violates the configured AI/LLM rule; do not detect whether prose was AI-written.',
    },
    post: postForModel(options.post, options.timezone),
    enabledRules: options.rules.map(ruleForModel),
    deterministicPrechecks: options.rules.map((rule) => precheckForRule(options.post, rule, options.timezone, now)),
    outputContract: {
      decision: 'allowed | needs_review | violation | uncertain | insufficient_context',
      ruleId: 'one enabled rule id or null',
      confidence: '0..1 calibrated confidence in the selected decision',
      suggestedAction: 'allow | log | flag_for_review | filter_to_modqueue',
      evidence: '0-5 visible evidence objects with field, excerpt, and note',
      actionReason: 'short moderator-facing reason suitable for a report/filter note',
    },
  };
}

export async function classifyWithOpenAI(options: {
  post: PostInput;
  rules: RuleConfigV2[];
  apiKey: string;
  model: string;
  timezone: string;
  now?: Date | undefined;
}): Promise<ClassificationResult> {
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
            'You are RulePilot, a conservative human-in-the-loop subreddit moderation triage assistant. Classify only against the enabled rules in the user payload. Never make irreversible moderation recommendations. Prefer needs_review or insufficient_context over violation when evidence is weak.',
        },
        {
          role: 'user',
          content: JSON.stringify(buildOpenAIClassificationInput({
            post: options.post,
            rules: options.rules,
            timezone: options.timezone,
            now: options.now,
          })),
        },
      ],
      text: {
        format: {
            type: 'json_schema',
            name: 'rulepilot_classification',
            strict: true,
            schema: openAIClassificationSchema(options.rules),
          },
        },
      }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI classification failed: ${response.status} ${body.slice(0, 300)}`);
  }

  return parseOpenAIClassificationResponse(await response.json());
}
