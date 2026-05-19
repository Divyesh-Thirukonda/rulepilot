import { z } from 'zod';

import type { ClassificationResult, PostInput, RuleConfigV2 } from '../shared/types';

const OPENAI_CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'ruleId', 'confidence', 'rationale', 'suggestedAction', 'matchedSignals'],
  properties: {
    decision: {
      type: 'string',
      enum: ['allowed', 'needs_review', 'violation', 'uncertain', 'insufficient_context'],
    },
    ruleId: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
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
  },
} as const;

const llmClassification = z.object({
  decision: z.enum(['allowed', 'needs_review', 'violation', 'uncertain', 'insufficient_context']),
  ruleId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  suggestedAction: z.enum(['allow', 'log', 'flag_for_review', 'filter_to_modqueue']),
  matchedSignals: z.array(z.string()).default([]),
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
  return {
    ...parsed,
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
  return {
    titleLength: title.trim().length,
    bodyLength: body.trim().length,
    hasQuestionMark: combined.includes('?'),
    hasUrl: /https?:\/\/|www\./i.test(combined) || Boolean(post.url),
    hasMediaUrl: /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)(?:\?|$)/i.test(post.url ?? ''),
    isTitleOnly: title.trim().length > 0 && body.trim().length === 0,
  };
}

function postForModel(post: PostInput, timezone: string): Record<string, unknown> {
  return {
    title: post.title,
    bodyExcerpt: post.body?.slice(0, 3500),
    flairText: post.flairText,
    urlDomain: post.url ? safeDomain(post.url) : undefined,
    postType: post.postType,
    createdAtUtc: post.createdAt?.toISOString(),
    createdWeekday: weekdayInTimezone(post.createdAt, timezone),
    createdLocalTime: localTimeInTimezone(post.createdAt, timezone),
    timezone,
    qualityIndicators: qualityIndicators(post),
  };
}

function ruleForModel(rule: RuleConfigV2): Record<string, unknown> {
  return {
    id: rule.id,
    title: rule.title,
    description: rule.description,
    action: rule.action,
    threshold: rule.threshold,
    examples: rule.examples,
    negativeExamples: rule.negativeExamples.length > 0 ? rule.negativeExamples : undefined,
    redirectTargetType: rule.redirectTargetType,
    redirectTarget: rule.redirectTarget,
    redirectTemplate: rule.redirectTemplate,
    redirect: rule.redirect,
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

export function buildOpenAIClassificationInput(options: {
  post: PostInput;
  rules: RuleConfigV2[];
  timezone: string;
}): Record<string, unknown> {
  return {
    task: 'Classify this post against enabled subreddit rules only.',
    rubric: [
      'Be conservative. Choose violation only when the post clearly matches a provided rule.',
      'Use needs_review for likely issues that need moderator judgment.',
      'Use insufficient_context when the post lacks enough evidence to classify a rule violation.',
      'Use allowed when no provided rule applies.',
      'Return short evidence bullets in matchedSignals. Quote or summarize only text visible in the provided post payload.',
      'Do not infer author intent, identity, history, private profile data, or cross-subreddit behavior.',
      'For AI/LLM policy rules, classify the policy topic only. Do not claim authorship detection or say text is AI-generated unless the post itself says so.',
    ],
    calibration: {
      outOfScope: 'Require strong evidence that the post is not about CS education before choosing violation.',
      lowQuality: 'Default to needs_review unless the low-effort signal is obvious from length/context indicators.',
      memes: 'Meme/shitpost can be high confidence when flair or explicit meme language is present.',
      aiLlms: 'Evaluate whether the topic violates the configured AI/LLM rule; do not detect whether prose was AI-written.',
    },
    post: postForModel(options.post, options.timezone),
    enabledRules: options.rules.map(ruleForModel),
  };
}

export async function classifyWithOpenAI(options: {
  post: PostInput;
  rules: RuleConfigV2[];
  apiKey: string;
  model: string;
  timezone: string;
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
          })),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'rulepilot_classification',
          strict: true,
          schema: OPENAI_CLASSIFICATION_SCHEMA,
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
