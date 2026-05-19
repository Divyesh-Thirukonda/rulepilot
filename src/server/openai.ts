import { z } from 'zod';

import type { ClassificationResult, PostInput, RuleConfigV2 } from '../shared/types';

const OPENAI_CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'ruleId', 'confidence', 'rationale', 'suggestedAction', 'matchedSignals'],
  properties: {
    decision: {
      type: 'string',
      enum: ['allowed', 'needs_review', 'violation', 'uncertain'],
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
  decision: z.enum(['allowed', 'needs_review', 'violation', 'uncertain']),
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

function postForModel(post: PostInput): Record<string, string | undefined> {
  return {
    title: post.title,
    body: post.body?.slice(0, 3500),
    flairText: post.flairText,
    urlDomain: post.url ? safeDomain(post.url) : undefined,
    postType: post.postType,
  };
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
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
    redirect: rule.redirect,
    conditions: rule.conditions.map((c) => ({
      type: c.type,
      field: c.field,
      value: c.value,
      negate: c.negate || undefined,
      days: c.days,
    })),
    modNotes: rule.modNotes || undefined,
  };
}

export async function classifyWithOpenAI(options: {
  post: PostInput;
  rules: RuleConfigV2[];
  apiKey: string;
  model: string;
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
            'You are RulePilot, a conservative subreddit moderation triage assistant. Classify only against the provided rules. Prefer needs_review over violation when uncertain. Do not infer user traits or use author history.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            post: postForModel(options.post),
            rules: options.rules.map(ruleForModel),
          }),
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
