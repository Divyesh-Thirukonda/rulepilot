import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, reddit } from '@devvit/web/server';
import type {
  MenuItemRequest,
  OnAutomoderatorFilterPostRequest,
  OnPostDeleteRequest,
  OnPostSubmitRequest,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared';
import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';

import { generateRuleId } from '../shared/rules';
import { isValidRedirectTarget } from '../shared/redirects';
import type {
  CaseFeedback,
  ConditionField,
  ConditionType,
  PostType,
  RedirectTargetType,
  RepairStrategy,
  RuleBuilderRequest,
  RuleBuilderResponse,
  RuleAction,
  RuleCategory,
  RuleCondition,
  RuleConfigV2,
  SubredditRuleInput,
} from '../shared/types';
import { buildAutomoderatorCase } from './automod';
import { draftRuleWithOpenAI } from './rule-builder';
import { scanPost } from './classifier';
import { enabledRulesFromList } from './policy';
import { getOpenAiApiKey, getRulePilotSettings } from './settings';
import { buildStats, deleteCase, getRecentCases, saveCase, updateCaseFeedback } from './storage';
import { postInputFromPost, postInputFromPostV2, postInputFromTrigger } from './post-input';
import {
  deleteRule,
  exportRules,
  getSubredditRules,
  importRules,
  seedPresetIfEmpty,
  toggleRule,
  upsertRule,
} from './rule-storage';

const app = new Hono();

// ---------------------------------------------------------------------------
// Rule input validation
// ---------------------------------------------------------------------------

const VALID_ACTIONS = new Set<RuleAction>(['allow', 'log', 'flag', 'filter']);
const VALID_CATEGORIES = new Set<RuleCategory>(['scope', 'civility', 'format', 'quality', 'repetition', 'promotion', 'sensitive', 'megathread']);
const VALID_CONDITION_TYPES = new Set<ConditionType>(['keyword', 'regex', 'post_type', 'flair', 'url_domain', 'title_length', 'body_length', 'day_of_week', 'time_window', 'semantic']);
const VALID_CONDITION_FIELDS = new Set<ConditionField>(['title', 'body', 'title_and_body', 'flair', 'url']);
const VALID_POST_TYPES = new Set<PostType>(['text', 'link', 'media', 'poll', 'crosspost']);
const VALID_DAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const VALID_REDIRECT_TARGET_TYPES = new Set<RedirectTargetType>(['subreddit', 'megathread', 'url', 'custom']);
const VALID_REPAIR_STRATEGIES = new Set<RepairStrategy>(['repost_later', 'add_context', 'use_thread', 'custom']);
const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 2000;
const MAX_EXAMPLES = 20;
const MAX_CONDITIONS = 30;
const MAX_CONDITION_VALUE_LEN = 1000;
const MAX_REDIRECT_TARGET_LEN = 500;
const MAX_REDIRECT_TEMPLATE_LEN = 1200;
const MAX_REPAIR_TEMPLATE_LEN = 1200;

function splitConditionValue(value: string): string[] {
  return value.split('|').map((part) => part.trim()).filter(Boolean);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateStringList(name: string, value: unknown, max: number): string | null {
  if (!Array.isArray(value)) {
    return `${name} must be an array.`;
  }
  if (value.length > max) {
    return `Maximum ${max} ${name.toLowerCase()} allowed.`;
  }
  if (!value.every((item) => typeof item === 'string')) {
    return `${name} must only contain strings.`;
  }
  return null;
}

function validateRangeCondition(cond: RuleCondition, label: string, minAllowed = 0, maxAllowed = Number.MAX_SAFE_INTEGER): string | null {
  const hasMin = cond.min !== undefined;
  const hasMax = cond.max !== undefined;
  if (!hasMin && !hasMax) {
    return `${label} condition needs a min or max value.`;
  }
  if (hasMin && (!isFiniteNumber(cond.min) || cond.min < minAllowed || cond.min > maxAllowed)) {
    return `${label} min must be a number between ${minAllowed} and ${maxAllowed}.`;
  }
  if (hasMax && (!isFiniteNumber(cond.max) || cond.max < minAllowed || cond.max > maxAllowed)) {
    return `${label} max must be a number between ${minAllowed} and ${maxAllowed}.`;
  }
  if (hasMin && hasMax && cond.min! > cond.max!) {
    return `${label} min cannot be greater than max.`;
  }
  return null;
}

function validateCondition(cond: unknown): string | null {
  if (typeof cond !== 'object' || cond === null) {
    return 'Condition must be an object.';
  }
  const condition = cond as Partial<RuleCondition>;
  if (!condition.type || !VALID_CONDITION_TYPES.has(condition.type)) {
    return `Invalid condition type: ${String(condition.type)}.`;
  }
  if (condition.field !== undefined && !VALID_CONDITION_FIELDS.has(condition.field)) {
    return `Invalid condition field: ${condition.field}.`;
  }
  if (condition.value !== undefined && typeof condition.value !== 'string') {
    return 'Condition value must be a string.';
  }
  if (condition.value !== undefined && condition.value.length > MAX_CONDITION_VALUE_LEN) {
    return `Condition value must be ${MAX_CONDITION_VALUE_LEN} characters or fewer.`;
  }
  if (condition.negate !== undefined && typeof condition.negate !== 'boolean') {
    return 'Condition negate must be a boolean.';
  }

  const value = condition.value ?? '';
  const tokens = splitConditionValue(value);
  switch (condition.type) {
    case 'keyword':
    case 'flair':
    case 'semantic':
      return tokens.length === 0 ? `${condition.type} condition needs at least one value.` : null;
    case 'regex':
      if (!value.trim()) {
        return 'regex condition needs a pattern.';
      }
      try {
        new RegExp(value);
      } catch {
        return 'regex condition has an invalid pattern.';
      }
      return null;
    case 'post_type': {
      if (tokens.length === 0) {
        return 'post_type condition needs at least one post type.';
      }
      const invalid = tokens.find((token) => !VALID_POST_TYPES.has(token.toLowerCase() as PostType));
      return invalid ? `Invalid post type: ${invalid}.` : null;
    }
    case 'url_domain': {
      if (tokens.length === 0) {
        return 'url_domain condition needs at least one domain.';
      }
      const invalid = tokens.find((token) => !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}$/i.test(token));
      return invalid ? `Invalid URL domain: ${invalid}. Use domains like example.com, not full URLs.` : null;
    }
    case 'title_length':
      return validateRangeCondition(condition as RuleCondition, 'title_length');
    case 'body_length':
      return validateRangeCondition(condition as RuleCondition, 'body_length');
    case 'day_of_week': {
      if (!Array.isArray(condition.days) || condition.days.length === 0) {
        return 'day_of_week condition needs at least one day.';
      }
      const invalid = condition.days.find((day) => typeof day !== 'string' || !VALID_DAYS.has(day));
      return invalid ? `Invalid day of week: ${String(invalid)}.` : null;
    }
    case 'time_window':
      return validateRangeCondition(condition as RuleCondition, 'time_window', 0, 23);
  }
}

function validateRuleInput(body: Partial<RuleConfigV2>): string | null {
  if (body.action !== undefined && !VALID_ACTIONS.has(body.action)) {
    return `Invalid action: ${body.action}. Must be one of: ${[...VALID_ACTIONS].join(', ')}.`;
  }
  if (body.category !== undefined && !VALID_CATEGORIES.has(body.category)) {
    return `Invalid category: ${body.category}. Must be one of: ${[...VALID_CATEGORIES].join(', ')}.`;
  }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return 'Enabled state must be a boolean.';
  }
  if (body.threshold !== undefined && (!isFiniteNumber(body.threshold) || body.threshold < 0.01 || body.threshold > 0.99)) {
    return 'Threshold must be a number between 0.01 and 0.99.';
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return 'Title must be a string.';
    }
    if (body.title.length > MAX_TITLE_LEN) {
      return `Title must be ${MAX_TITLE_LEN} characters or fewer.`;
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return 'Description must be a string.';
    }
    if (body.description.length > MAX_DESC_LEN) {
      return `Description must be ${MAX_DESC_LEN} characters or fewer.`;
    }
  }
  if (body.examples !== undefined) {
    const validationError = validateStringList('Examples', body.examples, MAX_EXAMPLES);
    if (validationError) return validationError;
  }
  if (body.negativeExamples !== undefined) {
    const validationError = validateStringList('Negative examples', body.negativeExamples, MAX_EXAMPLES);
    if (validationError) return validationError;
  }
  if (body.redirect !== undefined && typeof body.redirect !== 'string') {
    return 'Redirect guidance must be a string.';
  }
  const hasStructuredRedirect =
    body.redirectTargetType !== undefined || body.redirectTarget !== undefined || body.redirectTemplate !== undefined;
  if (hasStructuredRedirect) {
    const redirectTargetValue = typeof body.redirectTarget === 'string' ? body.redirectTarget : '';
    const redirectTemplateValue = typeof body.redirectTemplate === 'string' ? body.redirectTemplate : '';
    const clearsStructuredRedirect =
      body.redirectTargetType === undefined &&
      redirectTargetValue.trim() === '' &&
      redirectTemplateValue.trim() === '';
    if (clearsStructuredRedirect) {
      // Empty strings from the Rule Studio form intentionally clear any existing structured redirect.
    } else {
      if (!body.redirectTargetType || !VALID_REDIRECT_TARGET_TYPES.has(body.redirectTargetType)) {
        return `Invalid redirect target type. Must be one of: ${[...VALID_REDIRECT_TARGET_TYPES].join(', ')}.`;
      }
      if (typeof body.redirectTarget !== 'string') {
        return 'Redirect target must be a string.';
      }
      if (body.redirectTarget.length > MAX_REDIRECT_TARGET_LEN) {
        return `Redirect target must be ${MAX_REDIRECT_TARGET_LEN} characters or fewer.`;
      }
      if (!isValidRedirectTarget(body.redirectTargetType, body.redirectTarget)) {
        return body.redirectTargetType === 'url'
          ? 'Redirect URL must be a valid http(s) URL.'
          : `Redirect target is not valid for ${body.redirectTargetType}.`;
      }
      if (typeof body.redirectTemplate !== 'string' || !body.redirectTemplate.trim()) {
        return 'Redirect template must be a non-empty string.';
      }
      if (body.redirectTemplate.length > MAX_REDIRECT_TEMPLATE_LEN) {
        return `Redirect template must be ${MAX_REDIRECT_TEMPLATE_LEN} characters or fewer.`;
      }
    }
  }
  if (body.modNotes !== undefined && typeof body.modNotes !== 'string') {
    return 'Mod notes must be a string.';
  }
  if (body.repairStrategy !== undefined && !VALID_REPAIR_STRATEGIES.has(body.repairStrategy)) {
    return `Invalid repair strategy. Must be one of: ${[...VALID_REPAIR_STRATEGIES].join(', ')}.`;
  }
  if (body.repairTemplate !== undefined) {
    if (typeof body.repairTemplate !== 'string') {
      return 'Repair template must be a string.';
    }
    if (body.repairTemplate.length > MAX_REPAIR_TEMPLATE_LEN) {
      return `Repair template must be ${MAX_REPAIR_TEMPLATE_LEN} characters or fewer.`;
    }
  }
  if (body.conditions !== undefined) {
    if (!Array.isArray(body.conditions)) {
      return 'Conditions must be an array.';
    }
    if (body.conditions.length > MAX_CONDITIONS) {
      return `Maximum ${MAX_CONDITIONS} conditions per rule.`;
    }
    for (const cond of body.conditions) {
      const validationError = validateCondition(cond);
      if (validationError) {
        return validationError;
      }
    }
  }
  return null;
}

function sanitizeConditions(conditions: RuleCondition[]): RuleCondition[] {
  return conditions.map((c) => {
    const clean: RuleCondition = { type: c.type, value: (c.value ?? '').trim() };
    if (c.field !== undefined) clean.field = c.field;
    if (c.min !== undefined) clean.min = c.min;
    if (c.max !== undefined) clean.max = c.max;
    if (c.days !== undefined) clean.days = c.days.filter((day) => VALID_DAYS.has(day));
    if (c.negate !== undefined) clean.negate = c.negate;
    return clean;
  });
}

function copyRedirectFields(target: RuleConfigV2, body: Partial<RuleConfigV2>, existing?: RuleConfigV2): void {
  const clearsStructuredRedirect =
    body.redirectTargetType === undefined &&
    body.redirectTarget !== undefined &&
    body.redirectTemplate !== undefined &&
    body.redirectTarget.trim() === '' &&
    body.redirectTemplate.trim() === '';
  if (clearsStructuredRedirect) {
    delete target.redirectTargetType;
    delete target.redirectTarget;
    delete target.redirectTemplate;
  } else {
    if (body.redirectTargetType !== undefined) {
      target.redirectTargetType = body.redirectTargetType;
    } else if (existing?.redirectTargetType !== undefined) {
      target.redirectTargetType = existing.redirectTargetType;
    }
    if (body.redirectTarget !== undefined) {
      target.redirectTarget = body.redirectTarget.trim();
    } else if (existing?.redirectTarget !== undefined) {
      target.redirectTarget = existing.redirectTarget;
    }
    if (body.redirectTemplate !== undefined) {
      target.redirectTemplate = body.redirectTemplate.trim();
    } else if (existing?.redirectTemplate !== undefined) {
      target.redirectTemplate = existing.redirectTemplate;
    }
  }
  if (body.redirect !== undefined) {
    target.redirect = body.redirect.trim();
  } else if (existing?.redirect !== undefined) {
    target.redirect = existing.redirect;
  }
  const clearsRepair = body.repairStrategy === undefined && body.repairTemplate !== undefined && body.repairTemplate.trim() === '';
  if (clearsRepair) {
    delete target.repairStrategy;
    delete target.repairTemplate;
  } else {
    if (body.repairStrategy !== undefined) {
      target.repairStrategy = body.repairStrategy;
    } else if (existing?.repairStrategy !== undefined) {
      target.repairStrategy = existing.repairStrategy;
    }
    if (body.repairTemplate !== undefined) {
      target.repairTemplate = body.repairTemplate.trim();
    } else if (existing?.repairTemplate !== undefined) {
      target.repairTemplate = existing.repairTemplate;
    }
  }
}

function postId(value: string): `t3_${string}` {
  return value.startsWith('t3_') ? (value as `t3_${string}`) : `t3_${value}`;
}

function postUrl(permalink: string): string {
  return new URL(permalink, 'https://www.reddit.com').toString();
}

function summarizeCase(record: Awaited<ReturnType<typeof scanPost>>, rules: RuleConfigV2[]): string {
  const rule = record.result.ruleId ? rules.find((candidate) => candidate.id === record.result.ruleId) : undefined;
  const label = rule?.title ?? 'No rule matched';
  return `${label}: ${Math.round(record.result.confidence * 100)}% (${record.action})`;
}

async function recordAutomoderatorFilteredPost(input: OnAutomoderatorFilterPostRequest): Promise<void> {
  if (!input.post || !input.subreddit) {
    return;
  }
  const postInput = postInputFromPostV2(input.post, input.subreddit.name);
  await saveCase(buildAutomoderatorCase(postInput, input.reason));
}

function ruleBuilderRequest(body: Partial<RuleBuilderRequest>, rules: RuleConfigV2[], timezone: string): RuleBuilderRequest {
  return {
    mode: body.mode ?? 'natural_language',
    intent: body.intent,
    templateId: body.templateId,
    subredditRule: body.subredditRule,
    timezone,
    currentRules: rules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      description: rule.description,
    })),
  };
}

function subredditRuleInput(rule: {
  shortName: string;
  description: string;
  kind?: 'all' | 'link' | 'comment';
  violationReason?: string;
}): SubredditRuleInput {
  return {
    title: rule.shortName,
    description: rule.description,
    kind: rule.kind,
    violationReason: rule.violationReason,
  };
}

async function dependencies() {
  const rulePilotSettings = await getRulePilotSettings();
  const subredditName = context.subredditName ?? 'unknown';
  const rules = await getSubredditRules(subredditName);
  return {
    settings: rulePilotSettings,
    rules,
    openAiApiKey: await getOpenAiApiKey(),
  };
}

async function isCurrentUserModerator(): Promise<boolean> {
  if (!context.username || !context.subredditName) {
    return false;
  }
  try {
    const moderators = await reddit
      .getModerators({
        subredditName: context.subredditName,
        username: context.username,
        limit: 1,
      })
      .all();
    return moderators.some((moderator) => moderator.username.toLowerCase() === context.username?.toLowerCase());
  } catch {
    return false;
  }
}

async function requireModerator(c: HonoContext): Promise<Response | true> {
  if (await isCurrentUserModerator()) {
    return true;
  }
  return c.json({ error: 'RulePilot dashboard data is restricted to subreddit moderators.' }, 403);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

app.post('/internal/triggers/post-submit', async (c) => {
  const input = await c.req.json<OnPostSubmitRequest>();
  const postInput = postInputFromTrigger(input);
  if (!postInput) {
    return c.json<TriggerResponse>({});
  }

  const deps = await dependencies();
  let postApi;
  try {
    postApi = await reddit.getPostById(postId(postInput.id));
  } catch {
    postApi = undefined;
  }
  await scanPost(postInput, {
    ...deps,
    postApi,
    force: false,
  });

  return c.json<TriggerResponse>({});
});

app.post('/internal/triggers/post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>();
  if (input.postId) {
    await deleteCase(postId(input.postId));
  }

  return c.json<TriggerResponse>({});
});

app.post('/internal/triggers/automod-filter-post', async (c) => {
  const input = await c.req.json<OnAutomoderatorFilterPostRequest>();
  await recordAutomoderatorFilteredPost(input);

  return c.json<TriggerResponse>({});
});

// ---------------------------------------------------------------------------
// Menu actions
// ---------------------------------------------------------------------------

app.post('/internal/menu/scan-post', async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  if (input.location !== 'post') {
    return c.json<UiResponse>({ showToast: 'RulePilot can only scan posts.' });
  }

  const target = await reddit.getPostById(postId(input.targetId));
  const deps = await dependencies();
  const record = await scanPost(postInputFromPost(target), {
    ...deps,
    postApi: target,
    force: true,
  });

  return c.json<UiResponse>({
    showToast: {
      text: `RulePilot scan complete. ${summarizeCase(record, deps.rules)}`,
      appearance: 'success',
    },
  });
});

async function markFeedback(input: MenuItemRequest, feedback: CaseFeedback): Promise<UiResponse> {
  if (input.location !== 'post') {
    return { showToast: 'RulePilot feedback applies to posts only.' };
  }
  const updated = await updateCaseFeedback(postId(input.targetId), feedback);
  if (!updated) {
    return { showToast: 'RulePilot has no scan record for this post yet.' };
  }
  return {
    showToast: {
      text: feedback === 'correct' ? 'Marked RulePilot result as correct.' : 'Marked RulePilot result as a false positive.',
      appearance: 'success',
    },
  };
}

app.post('/internal/menu/mark-correct', async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(await markFeedback(input, 'correct'));
});

app.post('/internal/menu/mark-false-positive', async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(await markFeedback(input, 'false_positive'));
});

app.post('/internal/menu/create-dashboard', async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  if (input.location !== 'subreddit') {
    return c.json<UiResponse>({ showToast: 'Create the RulePilot dashboard from the subreddit menu.' });
  }

  const dashboard = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'RulePilot moderator dashboard',
    entry: 'default',
    textFallback: {
      text: 'RulePilot dashboard for moderator review of rule-triage cases.',
    },
    postData: {
      kind: 'rulepilot-dashboard',
    },
  });

  return c.json<UiResponse>({
    navigateTo: {
      url: postUrl(dashboard.permalink),
      permalink: dashboard.permalink,
    },
  });
});

// ---------------------------------------------------------------------------
// Dashboard API — Cases
// ---------------------------------------------------------------------------

app.get('/api/cases', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const [cases, settings, rules] = await Promise.all([
    getRecentCases(75),
    getRulePilotSettings(),
    getSubredditRules(subredditName),
  ]);
  return c.json({
    cases,
    stats: buildStats(cases, rules),
    settings,
  });
});

app.get('/api/rules', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const rules = await getSubredditRules(subredditName);
  const enabled = enabledRulesFromList(rules);
  return c.json({
    rules: enabled,
  });
});

app.post('/api/feedback', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const body = (await c.req.json()) as { postId?: string; feedback?: CaseFeedback };
  if (!body.postId || !body.feedback) {
    return c.json({ error: 'postId and feedback are required.' }, 400);
  }
  const updated = await updateCaseFeedback(postId(body.postId), body.feedback);
  if (!updated) {
    return c.json({ error: 'Case not found.' }, 404);
  }
  return c.json({ case: updated });
});

// ---------------------------------------------------------------------------
// Rule Studio API — V2 CRUD
// ---------------------------------------------------------------------------

/** List all rules for this subreddit (including disabled). */
app.get('/api/rules/v2', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const rules = await getSubredditRules(subredditName);
  return c.json({ rules });
});

/** Create a new rule. */
app.post('/api/rules/v2', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const body = (await c.req.json()) as Partial<RuleConfigV2>;
  const validationError = validateRuleInput(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  const now = new Date().toISOString();
  const rule: RuleConfigV2 = {
    id: generateRuleId(),
    title: body.title ?? 'Untitled rule',
    description: body.description ?? '',
    examples: body.examples ?? [],
    negativeExamples: body.negativeExamples ?? [],
    action: body.action ?? 'flag',
    threshold: body.threshold ?? 0.76,
    category: body.category ?? 'quality',
    enabled: body.enabled ?? false,
    conditions: sanitizeConditions(body.conditions ?? []),
    createdAt: now,
    updatedAt: now,
    source: 'custom',
  };
  copyRedirectFields(rule, body);
  if (body.modNotes !== undefined) rule.modNotes = body.modNotes;
  const rules = await upsertRule(subredditName, rule);
  return c.json({ rule, rules }, 201);
});

/** Update an existing rule. */
app.put('/api/rules/v2/:id', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const ruleId = c.req.param('id');
  const existingRules = await getSubredditRules(subredditName);
  const existing = existingRules.find((r) => r.id === ruleId);
  if (!existing) {
    return c.json({ error: 'Rule not found.' }, 404);
  }
  const body = (await c.req.json()) as Partial<RuleConfigV2>;
  const validationError = validateRuleInput(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  const updated: RuleConfigV2 = {
    ...existing,
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    examples: body.examples ?? existing.examples,
    negativeExamples: body.negativeExamples ?? existing.negativeExamples,
    action: body.action ?? existing.action,
    threshold: body.threshold ?? existing.threshold,
    category: body.category ?? existing.category,
    enabled: body.enabled ?? existing.enabled,
    conditions: body.conditions ? sanitizeConditions(body.conditions) : existing.conditions,
    updatedAt: new Date().toISOString(),
  };
  copyRedirectFields(updated, body, existing);
  if (body.modNotes !== undefined) updated.modNotes = body.modNotes;
  else if (existing.modNotes !== undefined) updated.modNotes = existing.modNotes;
  const rules = await upsertRule(subredditName, updated);
  return c.json({ rule: updated, rules });
});

/** Delete a rule. */
app.delete('/api/rules/v2/:id', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const ruleId = c.req.param('id');
  const rules = await deleteRule(subredditName, ruleId);
  return c.json({ rules });
});

/** Toggle a rule enabled/disabled. */
app.patch('/api/rules/v2/:id/toggle', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const ruleId = c.req.param('id');
  const body = (await c.req.json()) as { enabled?: boolean };
  if (body.enabled === undefined) {
    return c.json({ error: 'enabled is required.' }, 400);
  }
  const rules = await toggleRule(subredditName, ruleId, body.enabled);
  return c.json({ rules });
});

/** Seed the r/csMajors preset. */
app.post('/api/rules/v2/seed-preset', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const rules = await seedPresetIfEmpty(subredditName);
  return c.json({ rules });
});

/** Export all rules as JSON. */
app.get('/api/rules/v2/export', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const rules = await exportRules(subredditName);
  return c.json({ rules });
});

/** Import rules from JSON. */
app.post('/api/rules/v2/import', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const body = (await c.req.json()) as { rules?: RuleConfigV2[] };
  if (!Array.isArray(body.rules)) {
    return c.json({ error: 'rules array is required.' }, 400);
  }
  // Validate each imported rule
  for (const rule of body.rules) {
    if (!rule.id || typeof rule.id !== 'string') {
      return c.json({ error: 'Imported rules must include a string id.' }, 400);
    }
    const validationError = validateRuleInput(rule);
    if (validationError) {
      return c.json({ error: `Invalid imported rule "${rule.title ?? rule.id}": ${validationError}` }, 400);
    }
  }
  // Sanitize: force source to 'custom' for imported rules, sanitize conditions
  const sanitized = body.rules.map((r) => ({
    ...r,
    source: 'custom' as const,
    conditions: sanitizeConditions(r.conditions ?? []),
    redirectTarget: r.redirectTarget?.trim(),
    redirectTemplate: r.redirectTemplate?.trim(),
    redirect: r.redirect?.trim(),
    repairTemplate: r.repairTemplate?.trim(),
  }));
  const rules = await importRules(subredditName, sanitized);
  return c.json({ rules });
});

/** Generate one disabled rule draft from a prompt, template, or subreddit rule text. */
app.post('/api/rules/v2/ai-draft', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName ?? 'unknown';
  const [settings, apiKey, currentRules] = await Promise.all([
    getRulePilotSettings(),
    getOpenAiApiKey(),
    getSubredditRules(subredditName),
  ]);
  const body = (await c.req.json()) as Partial<RuleBuilderRequest>;
  if (body.mode === 'natural_language' && !body.intent?.trim()) {
    return c.json({ error: 'Describe the rule you want to build.' }, 400);
  }
  if (body.mode === 'subreddit_rule' && !body.subredditRule) {
    return c.json({ error: 'subredditRule is required for subreddit rule drafting.' }, 400);
  }
  if (body.mode === 'template' && !body.templateId) {
    return c.json({ error: 'templateId is required for template drafting.' }, 400);
  }
  if (body.mode !== 'template' && !apiKey) {
    return c.json({ error: 'OpenAI API key is required for AI Builder drafts.' }, 400);
  }

  let draft: RuleBuilderResponse;
  try {
    draft = await draftRuleWithOpenAI({
      request: ruleBuilderRequest(body, currentRules, settings.timezone),
      apiKey: apiKey ?? '',
      model: settings.openAiModel,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }

  if (draft.status === 'draft') {
    const validationError = validateRuleInput(draft.rule);
    if (validationError) {
      return c.json({ error: `Generated draft was invalid: ${validationError}` }, 502);
    }
  }
  return c.json(draft);
});

/** Draft disabled RulePilot rules from the current subreddit's written rules. */
app.post('/api/rules/v2/import-subreddit-rules', async (c) => {
  const allowed = await requireModerator(c);
  if (allowed !== true) {
    return allowed;
  }
  const subredditName = context.subredditName;
  if (!subredditName) {
    return c.json({ error: 'Subreddit context is unavailable.' }, 400);
  }
  const [settings, apiKey, currentRules] = await Promise.all([
    getRulePilotSettings(),
    getOpenAiApiKey(),
    getSubredditRules(subredditName),
  ]);
  if (!apiKey) {
    return c.json({ error: 'OpenAI API key is required to import subreddit rules.' }, 400);
  }

  try {
    const subreddit = await reddit.getSubredditByName(subredditName);
    const subredditRules = await subreddit.getRules();
    const drafts: RuleConfigV2[] = [];
    const errors: string[] = [];
    for (const rule of subredditRules.slice(0, 10)) {
      const response = await draftRuleWithOpenAI({
        request: ruleBuilderRequest({
          mode: 'subreddit_rule',
          subredditRule: subredditRuleInput(rule),
        }, currentRules, settings.timezone),
        apiKey,
        model: settings.openAiModel,
      });
      if (response.status === 'draft') {
        const validationError = validateRuleInput(response.rule);
        if (validationError) {
          errors.push(`${rule.shortName}: ${validationError}`);
        } else {
          drafts.push(response.rule);
        }
      } else {
        errors.push(`${rule.shortName}: ${response.questions.join(' ') || 'Needs clarification'}`);
      }
    }
    return c.json({
      drafts,
      importedCount: subredditRules.length,
      errors,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
