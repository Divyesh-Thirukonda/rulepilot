import { redis } from '@devvit/web/server';

import { CS_MAJORS_PRESET } from '../shared/rules';
import type { RuleConfigV2 } from '../shared/types';

const RULES_KEY_PREFIX = 'rulepilot:rules:';
const MAX_RULES = 50;
const ACTIVE_PRESET_RULE_IDS = new Set(CS_MAJORS_PRESET.map((rule) => rule.id));

function rulesKey(subredditName: string): string {
  return `${RULES_KEY_PREFIX}${subredditName.toLowerCase()}`;
}

function parseRules(value: string | null | undefined): RuleConfigV2[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RuleConfigV2[]) : undefined;
  } catch {
    return undefined;
  }
}

function pruneDeprecatedPresetRules(rules: RuleConfigV2[]): RuleConfigV2[] {
  return rules.filter((rule) => rule.source !== 'preset' || ACTIVE_PRESET_RULE_IDS.has(rule.id));
}

/** Get all rules for a subreddit, seeding from preset if none exist. */
export async function getSubredditRules(subredditName: string): Promise<RuleConfigV2[]> {
  const raw = await redis.get(rulesKey(subredditName));
  const existing = parseRules(raw);
  if (existing && existing.length > 0) {
    const pruned = pruneDeprecatedPresetRules(existing);
    if (pruned.length !== existing.length) {
      await saveSubredditRules(subredditName, pruned);
    }
    if (pruned.length === 0) {
      return seedPresetIfEmpty(subredditName);
    }
    return pruned;
  }
  return seedPresetIfEmpty(subredditName);
}

/** Persist the full rules array for a subreddit. */
export async function saveSubredditRules(subredditName: string, rules: RuleConfigV2[]): Promise<void> {
  await redis.set(rulesKey(subredditName), JSON.stringify(rules));
}

/** Add or update a single rule. Returns the updated rules array. */
export async function upsertRule(subredditName: string, rule: RuleConfigV2): Promise<RuleConfigV2[]> {
  const rules = await getSubredditRules(subredditName);
  const index = rules.findIndex((r) => r.id === rule.id);
  if (index >= 0) {
    rules[index] = { ...rule, updatedAt: new Date().toISOString() };
  } else {
    if (rules.length >= MAX_RULES) {
      throw new Error(`Maximum of ${MAX_RULES} rules per subreddit reached.`);
    }
    rules.push({ ...rule, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  await saveSubredditRules(subredditName, rules);
  return rules;
}

/** Delete a rule by ID. Returns the updated rules array. */
export async function deleteRule(subredditName: string, ruleId: string): Promise<RuleConfigV2[]> {
  const rules = await getSubredditRules(subredditName);
  const filtered = rules.filter((r) => r.id !== ruleId);
  await saveSubredditRules(subredditName, filtered);
  return filtered;
}

/** Toggle a rule enabled/disabled. Returns the updated rules array. */
export async function toggleRule(subredditName: string, ruleId: string, enabled: boolean): Promise<RuleConfigV2[]> {
  const rules = await getSubredditRules(subredditName);
  const rule = rules.find((r) => r.id === ruleId);
  if (rule) {
    rule.enabled = enabled;
    rule.updatedAt = new Date().toISOString();
  }
  await saveSubredditRules(subredditName, rules);
  return rules;
}

/** Seed the r/csMajors preset into the subreddit if no rules exist. */
export async function seedPresetIfEmpty(subredditName: string): Promise<RuleConfigV2[]> {
  const raw = await redis.get(rulesKey(subredditName));
  const existing = parseRules(raw);
  if (existing && existing.length > 0) {
    return existing;
  }
  const now = new Date().toISOString();
  const seeded = CS_MAJORS_PRESET.map((rule) => ({
    ...rule,
    createdAt: now,
    updatedAt: now,
  }));
  await saveSubredditRules(subredditName, seeded);
  return seeded;
}

/** Import rules from JSON, merging with existing. New IDs are added, existing are updated. */
export async function importRules(subredditName: string, incoming: RuleConfigV2[]): Promise<RuleConfigV2[]> {
  const rules = await getSubredditRules(subredditName);
  const now = new Date().toISOString();

  for (const imported of incoming) {
    const index = rules.findIndex((r) => r.id === imported.id);
    if (index >= 0) {
      // Update existing rule regardless of count
      rules[index] = { ...imported, updatedAt: now };
    } else {
      // Only check max when adding a new rule
      if (rules.length >= MAX_RULES) {
        break;
      }
      rules.push({ ...imported, createdAt: now, updatedAt: now });
    }
  }

  await saveSubredditRules(subredditName, rules);
  return rules;
}


/** Export all rules for a subreddit. */
export async function exportRules(subredditName: string): Promise<RuleConfigV2[]> {
  return getSubredditRules(subredditName);
}
