import type {
  ClassificationResult,
  ConditionField,
  PostInput,
  RuleCondition,
  RuleConfigV2,
} from '../shared/types';
import { suggestedActionForRoutingAction } from '../shared/actions';

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function normalizeText(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function fieldText(post: PostInput, field: ConditionField | undefined): string {
  switch (field) {
    case 'title':
      return normalizeText(post.title);
    case 'body':
      return normalizeText(post.body);
    case 'flair':
      return normalizeText(post.flairText);
    case 'url':
      return normalizeText(post.url);
    case 'title_and_body':
    default:
      return [normalizeText(post.title), normalizeText(post.body)].filter(Boolean).join(' \n ');
  }
}

function searchableText(post: PostInput): string {
  return [post.title, post.body, post.flairText, post.url].map(normalizeText).filter(Boolean).join(' \n ');
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

export function isSundayInTimezone(date: Date, timezone: string): boolean {
  return getDayOfWeekInTimezone(date, timezone) === 'Sunday';
}

export function getDayOfWeekInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(date);
  }
}

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Individual condition evaluators
// ---------------------------------------------------------------------------

export type ConditionEvalResult = { matched: boolean; signal: string };

function literalTokens(value: string): string[] {
  return value
    .split('|')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function evaluateKeyword(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  const text = fieldText(post, condition.field).toLowerCase();
  const tokens = literalTokens(condition.value);
  if (tokens.length === 0) return { matched: false, signal: '' };
  const matchedToken = tokens.find((token) => text.includes(token));
  return {
    matched: matchedToken !== undefined,
    signal: matchedToken ? `keyword "${matchedToken}" in ${condition.field ?? 'title_and_body'}` : '',
  };
}

function evaluateRegex(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  const text = fieldText(post, condition.field);
  try {
    const pattern = new RegExp(condition.value, 'i');
    const matched = pattern.test(text);
    return { matched, signal: matched ? `regex /${condition.value}/ matched` : '' };
  } catch {
    return { matched: false, signal: '' };
  }
}

function evaluatePostType(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  if (!post.postType) {
    return { matched: false, signal: '' };
  }
  const types = condition.value.split('|').map((t) => t.trim().toLowerCase());
  const matched = types.includes(post.postType);
  return { matched, signal: matched ? `post type is ${post.postType}` : '' };
}

function evaluateFlair(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  const flair = normalizeText(post.flairText).toLowerCase();
  if (!flair) {
    return { matched: false, signal: '' };
  }
  const tokens = literalTokens(condition.value);
  if (tokens.length === 0) return { matched: false, signal: '' };
  const matchedToken = tokens.find((token) => flair.includes(token));
  return { matched: matchedToken !== undefined, signal: matchedToken ? `flair matches "${matchedToken}"` : '' };
}

function evaluateUrlDomain(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  if (!post.url) {
    return { matched: false, signal: '' };
  }
  const domain = safeDomain(post.url);
  if (!domain) {
    return { matched: false, signal: '' };
  }
  const targets = condition.value.split('|').map((d) => d.trim().toLowerCase());
  const matched = targets.some((t) => domain === t || domain.endsWith(`.${t}`));
  return { matched, signal: matched ? `URL domain matches ${domain}` : '' };
}

function evaluateTitleLength(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  const len = normalizeText(post.title).length;
  const minOk = condition.min === undefined || len >= condition.min;
  const maxOk = condition.max === undefined || len <= condition.max;
  const matched = minOk && maxOk;
  return { matched, signal: matched ? `title length ${len} chars` : '' };
}

function evaluateBodyLength(post: PostInput, condition: RuleCondition): ConditionEvalResult {
  const body = normalizeText(post.body);
  const len = body.length;
  const minOk = condition.min === undefined || len >= condition.min;
  const maxOk = condition.max === undefined || len <= condition.max;
  const matched = minOk && maxOk;
  return { matched, signal: matched ? `body length ${len} chars` : '' };
}

function evaluateDayOfWeek(condition: RuleCondition, timezone: string, now: Date): ConditionEvalResult {
  const day = getDayOfWeekInTimezone(now, timezone);
  const days = condition.days ?? [];
  const matched = days.some((d) => d.toLowerCase() === day.toLowerCase());
  return { matched, signal: matched ? `day is ${day}` : `day is ${day}` };
}

function evaluateTimeWindow(condition: RuleCondition, timezone: string, now: Date): ConditionEvalResult {
  const hour = getHourInTimezone(now, timezone);
  const minOk = condition.min === undefined || hour >= condition.min;
  const maxOk = condition.max === undefined || hour <= condition.max;
  const matched = minOk && maxOk;
  return { matched, signal: matched ? `time ${hour}:00 in window` : '' };
}

export function evaluateCondition(
  post: PostInput,
  condition: RuleCondition,
  timezone: string,
  now: Date
): ConditionEvalResult {
  switch (condition.type) {
    case 'keyword':
      return evaluateKeyword(post, condition);
    case 'regex':
      return evaluateRegex(post, condition);
    case 'post_type':
      return evaluatePostType(post, condition);
    case 'flair':
      return evaluateFlair(post, condition);
    case 'url_domain':
      return evaluateUrlDomain(post, condition);
    case 'title_length':
      return evaluateTitleLength(post, condition);
    case 'body_length':
      return evaluateBodyLength(post, condition);
    case 'day_of_week':
      return evaluateDayOfWeek(condition, timezone, now);
    case 'time_window':
      return evaluateTimeWindow(condition, timezone, now);
    case 'semantic':
    default:
      return { matched: false, signal: '' };
  }
}

// ---------------------------------------------------------------------------
// Core: evaluate all conditions for a single rule
// ---------------------------------------------------------------------------

export type ConditionEngineResult = {
  matched: boolean;
  signals: string[];
  hasSemanticCondition: boolean;
};

export function evaluateConditions(
  post: PostInput,
  conditions: RuleCondition[],
  timezone: string,
  now: Date
): ConditionEngineResult {
  if (conditions.length === 0) {
    return { matched: false, signals: [], hasSemanticCondition: false };
  }

  const signals: string[] = [];
  let hasSemanticCondition = false;
  let allNonSemanticMatched = true;
  let anyNonSemanticCondition = false;

  for (const condition of conditions) {
    // Semantic conditions are deferred to LLM
    if (condition.type === 'semantic') {
      hasSemanticCondition = true;
      continue;
    }

    anyNonSemanticCondition = true;
    let result: ConditionEvalResult;

    result = evaluateCondition(post, condition, timezone, now);

    // Apply negation
    const effectiveMatch = condition.negate ? !result.matched : result.matched;

    if (effectiveMatch && result.signal) {
      signals.push(condition.negate ? `NOT ${result.signal}` : result.signal);
    }

    if (!effectiveMatch) {
      allNonSemanticMatched = false;
    }
  }

  // If the rule includes semantic conditions, the deterministic pass cannot
  // confirm a full match — the LLM must evaluate the semantic part too.
  // So we only report matched=true when ALL conditions are deterministic.
  const matched = anyNonSemanticCondition && allNonSemanticMatched && !hasSemanticCondition;

  return { matched, signals, hasSemanticCondition };
}

// ---------------------------------------------------------------------------
// Special handlers for preset rules with compound/OR logic
// ---------------------------------------------------------------------------

/**
 * The memes rule has special OR logic: keyword OR flair match triggers it,
 * AND the day_of_week condition must also pass.
 * We handle this by splitting conditions into groups.
 */
function evaluateShitpostsMemes(
  post: PostInput,
  rule: RuleConfigV2,
  timezone: string,
  now: Date
): ConditionEngineResult {
  const keywordConditions = rule.conditions.filter((c) => c.type === 'keyword');
  const flairConditions = rule.conditions.filter((c) => c.type === 'flair');
  const dayConditions = rule.conditions.filter((c) => c.type === 'day_of_week');

  // Content match: keyword OR flair
  const keywordResult = evaluateConditions(post, keywordConditions, timezone, now);
  const flairResult = evaluateConditions(post, flairConditions, timezone, now);
  const contentMatched = keywordResult.matched || flairResult.matched;
  const contentSignals = [...keywordResult.signals, ...flairResult.signals];

  if (!contentMatched) {
    return { matched: false, signals: [], hasSemanticCondition: false };
  }

  // Day check
  const dayResult = evaluateConditions(post, dayConditions, timezone, now);

  return {
    matched: contentMatched && dayResult.matched,
    signals: [...contentSignals, ...dayResult.signals],
    hasSemanticCondition: false,
  };
}

/**
 * The out-of-scope rule has two variant patterns (career-only OR general-college).
 * Career-only: career keywords present AND student keywords absent.
 * General-college: college-life keywords present AND CS keywords absent.
 */
function evaluateOutOfScope(
  post: PostInput,
  _rule: RuleConfigV2,
  _timezone: string,
  _now: Date
): ConditionEngineResult {
  const text = searchableText(post).toLowerCase();

  const careerOnly =
    /\b(salary|negotiate|promotion|layoff|manager|senior engineer|years of experience|yoe|switch jobs|job offer|career change)\b/.test(text) &&
    !/\b(student|freshman|sophomore|junior|senior year|college|university|class|course|major|internship|new grad|campus)\b/.test(text);

  const generalCollegeOnly =
    /\b(dorm|roommate|meal plan|campus housing|tuition bill|financial aid office|parking pass)\b/.test(text) &&
    !/\b(cs|computer science|programming|software|algorithms|data structures)\b/.test(text);

  if (careerOnly) {
    return { matched: true, signals: ['career-only signal'], hasSemanticCondition: false };
  }
  if (generalCollegeOnly) {
    return { matched: true, signals: ['general-college signal'], hasSemanticCondition: false };
  }
  return { matched: false, signals: [], hasSemanticCondition: false };
}

// ---------------------------------------------------------------------------
// Main: deterministic classification
// ---------------------------------------------------------------------------

function confidenceForRule(rule: RuleConfigV2): number {
  // Deterministic matches get a confidence boost over the rule threshold
  return Math.min(0.95, Math.max(rule.threshold, 0.8));
}

export function deterministicClassifyPost(
  post: PostInput,
  rules: RuleConfigV2[],
  now: Date = post.createdAt ?? new Date(),
  timezone = 'America/Chicago'
): ClassificationResult | null {
  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    if (rule.conditions.length === 0) {
      // Rules with no conditions are semantic-only → skip deterministic
      continue;
    }

    let result: ConditionEngineResult;

    // Special-case handlers for preset rules with compound logic
    if (rule.id === 'shitposts-and-memes') {
      result = evaluateShitpostsMemes(post, rule, timezone, now);

      // Special: if content matched but day check failed → it's Sunday, allow
      if (!result.matched) {
        const keywordConditions = rule.conditions.filter((c) => c.type === 'keyword');
        const flairConditions = rule.conditions.filter((c) => c.type === 'flair');
        const keywordResult = evaluateConditions(post, keywordConditions, timezone, now);
        const flairResult = evaluateConditions(post, flairConditions, timezone, now);
        if (keywordResult.matched || flairResult.matched) {
          // Content matched but day_of_week (negate Sunday) didn't → it IS Sunday
          return {
            decision: 'allowed',
            ruleId: rule.id,
            confidence: 0.82,
            rationale: 'The post looks like a meme or shitpost, but the subreddit permits these on Sundays.',
            suggestedAction: 'allow',
            source: 'deterministic',
            matchedSignals: ['meme/shitpost signal', 'Sunday exception'],
          };
        }
      }
    } else if (rule.id === 'out-of-scope' && rule.source === 'preset') {
      result = evaluateOutOfScope(post, rule, timezone, now);
    } else {
      result = evaluateConditions(post, rule.conditions, timezone, now);
    }

    if (result.matched) {
      const suggestedAction = suggestedActionForRoutingAction(rule.action);
      const confidence = confidenceForRule(rule);

      // Special decision overrides for specific rules
      let decision: ClassificationResult['decision'] =
        suggestedAction === 'allow' ? 'allowed' : 'violation';

      if (rule.id === 'amazon-optional') {
        decision = 'needs_review';
      }
      if (rule.id === 'common-questions') {
        decision = 'needs_review';
      }

      return {
        decision,
        ruleId: rule.id,
        confidence,
        rationale: `${rule.title}: ${rule.description}`,
        suggestedAction,
        source: 'deterministic',
        matchedSignals: result.signals,
      };
    }

    // If the rule has only semantic conditions, it needs LLM — don't block
    if (result.hasSemanticCondition && !result.matched) {
      continue;
    }
  }

  return null;
}
