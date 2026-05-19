import { redis } from '@devvit/web/server';

import { CS_MAJORS_PRESET, getRuleById } from '../shared/rules';
import type { CaseFeedback, CaseRecord, DashboardStats, RuleConfigV2 } from '../shared/types';

const CASE_INDEX_KEY = 'rulepilot:cases:index';
const CASE_KEY_PREFIX = 'rulepilot:case:';
const MAX_CASES = 250;
const CASE_RETENTION_DAYS = 30;
const CASE_RETENTION_MS = CASE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function caseKey(postId: string): string {
  return `${CASE_KEY_PREFIX}${postId}`;
}

function parseCase(value: string | null | undefined): CaseRecord | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as CaseRecord;
  } catch {
    return undefined;
  }
}

function retentionExpiration(): Date {
  return new Date(Date.now() + CASE_RETENTION_MS);
}

async function pruneExpiredCaseIndex(): Promise<void> {
  await redis.zRemRangeByScore(CASE_INDEX_KEY, 0, Date.now() - CASE_RETENTION_MS);
}

export async function getCase(postId: string): Promise<CaseRecord | undefined> {
  return parseCase(await redis.get(caseKey(postId)));
}

export async function saveCase(record: CaseRecord): Promise<void> {
  await redis.set(caseKey(record.postId), JSON.stringify(record), {
    expiration: retentionExpiration(),
  });
  await redis.zAdd(CASE_INDEX_KEY, {
    member: record.postId,
    score: Date.parse(record.createdAt),
  });
  await pruneExpiredCaseIndex();
  await redis.zRemRangeByRank(CASE_INDEX_KEY, 0, -(MAX_CASES + 1));
}

export async function deleteCase(postId: string): Promise<void> {
  await redis.del(caseKey(postId));
  await redis.zRem(CASE_INDEX_KEY, [postId]);
}

export async function updateCaseFeedback(postId: string, feedback: CaseFeedback): Promise<CaseRecord | undefined> {
  const existing = await getCase(postId);
  if (!existing) {
    return undefined;
  }
  const updated: CaseRecord = {
    ...existing,
    feedback,
    updatedAt: new Date().toISOString(),
  };
  await saveCase(updated);
  return updated;
}

export async function getRecentCases(limit = 50): Promise<CaseRecord[]> {
  await pruneExpiredCaseIndex();
  const members = await redis.zRange(CASE_INDEX_KEY, 0, limit - 1, {
    by: 'rank',
    reverse: true,
  });
  if (members.length === 0) {
    return [];
  }
  const values = await redis.mGet(members.map((member) => caseKey(member.member)));
  return values.map(parseCase).filter((record): record is CaseRecord => Boolean(record));
}

export function buildStats(cases: CaseRecord[], rules?: RuleConfigV2[]): DashboardStats {
  const actionCounts: DashboardStats['actionCounts'] = {
    none: 0,
    logged: 0,
    flagged: 0,
    filtered: 0,
    filter_unavailable: 0,
    error: 0,
  };
  const ruleCounts = new Map<string, number>();
  let reviewed = 0;
  let falsePositive = 0;

  for (const item of cases) {
    actionCounts[item.action] += 1;
    if (item.result.ruleId) {
      ruleCounts.set(item.result.ruleId, (ruleCounts.get(item.result.ruleId) ?? 0) + 1);
    }
    if (item.feedback) {
      reviewed += 1;
      if (item.feedback === 'false_positive') {
        falsePositive += 1;
      }
    }
  }

  const topRules = [...ruleCounts.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([ruleId, count]) => ({
      ruleId,
      title: rules?.find((r) => r.id === ruleId)?.title ?? getRuleById(ruleId)?.title ?? CS_MAJORS_PRESET.find((rule) => rule.id === ruleId)?.title ?? ruleId,
      count,
    }));

  return {
    totalCases: cases.length,
    falsePositiveRate: reviewed === 0 ? 0 : falsePositive / reviewed,
    topRules,
    actionCounts,
  };
}
