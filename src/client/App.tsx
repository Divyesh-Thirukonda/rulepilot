import { useEffect, useMemo, useState, useCallback } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';

import type {
  CaseFeedback, CaseRecord, ConditionField, ConditionType, DashboardStats,
  DashboardTab, PostType, RedirectTargetType, RepairStrategy, RuleAction, RuleCategory, RuleCondition, RuleConfigV2,
  RuleBuilderResponse, RulePilotSettings,
} from '../shared/types';
import { ROUTING_ACTIONS, routingActionDefinition, routingActionLabel, routingActionStatusClass } from '../shared/actions';
import { createRepairDraftUrl, createSubredditDraftUrl, redirectForRule, redirectTargetUrl } from '../shared/redirects';
import './styles.css';

// ── Types ──────────────────────────────────────────────────────────────────

type CasesResponse = { cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings };
type RulesResponse = { rules: RuleConfigV2[] };
type ErrorResponse = { error?: string; details?: string[]; code?: string; retryable?: boolean };

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings; rules: RuleConfigV2[] }
  | { status: 'error'; message: string };

type SimulatorPost = {
  title: string;
  body: string;
  flairText: string;
  url: string;
  postType: PostType;
  createdAt: string;
};

type SimulatorConditionResult = {
  label: string;
  matched: boolean;
  signal: string;
  semantic: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────

const actionLabels: Record<CaseRecord['action'], string> = {
  none: 'None', logged: 'Logged', flagged: 'Flagged', filtered: 'Filtered',
  filter_unavailable: 'Filter unavailable', automod_filtered: 'AutoModerator acted',
  skipped_automod: 'Skipped: AutoModerator', error: 'Error',
};
const feedbackLabels: Record<CaseFeedback, string> = {
  correct: 'Correct', false_positive: 'False positive', missed_violation: 'Missed violation',
};
const conditionTypeLabels: Record<ConditionType, string> = {
  keyword: 'Keyword / Phrase', regex: 'Regex', post_type: 'Post Type', flair: 'Flair Text',
  url_domain: 'URL Domain', title_length: 'Title Length', body_length: 'Body Length',
  day_of_week: 'Day of Week', time_window: 'Time Window', semantic: 'Semantic (AI)',
};
const categoryLabels: Record<RuleCategory, string> = {
  scope: 'Scope', civility: 'Civility', format: 'Format', quality: 'Quality',
  repetition: 'Repetition', promotion: 'Promotion', sensitive: 'Sensitive', megathread: 'Megathread',
};
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const POST_TYPES: PostType[] = ['text', 'link', 'media', 'poll', 'crosspost'];
const REPAIR_STRATEGIES: Array<{ value: RepairStrategy; label: string }> = [
  { value: 'repost_later', label: 'Repost later' },
  { value: 'add_context', label: 'Add context' },
  { value: 'use_thread', label: 'Use thread' },
  { value: 'custom', label: 'Custom' },
];
const REDIRECT_TARGET_TYPES: RedirectTargetType[] = ['subreddit', 'megathread', 'url', 'custom'];
const SUBREDDIT_RULE_IMPORT_KEY = 'rulepilot-imported-subreddit-rules';
const REDIRECT_PRESETS = [
  {
    id: 'none',
    label: 'No redirect guidance',
    redirectTargetType: undefined,
    redirectTarget: '',
    redirectTemplate: '',
  },
  {
    id: 'cscareerquestions',
    label: 'Please post this in r/cscareerquestions',
    redirectTargetType: 'subreddit' as const,
    redirectTarget: 'r/cscareerquestions',
    redirectTemplate: 'This looks mostly like career or job advice. Please post this in r/cscareerquestions instead.',
  },
  {
    id: 'resume-sticky',
    label: 'Please use the resume sticky',
    redirectTargetType: 'megathread' as const,
    redirectTarget: 'Resume sticky',
    redirectTemplate: 'Please use the resume sticky thread for resume reviews.',
  },
  {
    id: 'weekly-questions',
    label: 'Please use the weekly questions thread',
    redirectTargetType: 'megathread' as const,
    redirectTarget: 'Weekly questions thread',
    redirectTemplate: 'Please use the weekly questions thread for this kind of question.',
  },
  {
    id: 'college',
    label: 'Please use r/college',
    redirectTargetType: 'subreddit' as const,
    redirectTarget: 'r/college',
    redirectTemplate: 'This looks like a general college question. Please use r/college instead.',
  },
  {
    id: 'custom-subreddit',
    label: 'Custom subreddit',
    redirectTargetType: 'subreddit' as const,
    redirectTarget: 'r/',
    redirectTemplate: 'Please post this in the suggested subreddit instead.',
  },
  {
    id: 'custom-url',
    label: 'Custom URL or wiki',
    redirectTargetType: 'url' as const,
    redirectTarget: 'https://',
    redirectTemplate: 'Please use the linked resource for this topic.',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number): string { return `${Math.round(v * 100)}%`; }
function formatTime(v: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v));
}
function formatCompactTime(v: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(v));
}
async function requireOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => undefined) as ErrorResponse | undefined;
  throw new Error(body?.error ?? `${fallback} (${response.status})`);
}

function normalizeSimulatorText(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function conditionFieldText(post: SimulatorPost, field: ConditionField | undefined): string {
  switch (field) {
    case 'title':
      return normalizeSimulatorText(post.title);
    case 'body':
      return normalizeSimulatorText(post.body);
    case 'flair':
      return normalizeSimulatorText(post.flairText);
    case 'url':
      return normalizeSimulatorText(post.url);
    case 'title_and_body':
    default:
      return [normalizeSimulatorText(post.title), normalizeSimulatorText(post.body)].filter(Boolean).join(' \n ');
  }
}

function simulatorTokens(value: string): string[] {
  return value.split('|').map((token) => token.trim().toLowerCase()).filter(Boolean);
}

function simulatorDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function simulatorDay(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(date);
  }
}

function simulatorHour(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value;
    return hour ? parseInt(hour, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
}

function evaluateSimulatorCondition(condition: RuleCondition, post: SimulatorPost, timezone: string): SimulatorConditionResult {
  const label = conditionTypeLabels[condition.type];
  const date = post.createdAt ? new Date(post.createdAt) : new Date();
  let matched = false;
  let signal = '';
  let semantic = false;

  switch (condition.type) {
    case 'keyword': {
      const text = conditionFieldText(post, condition.field).toLowerCase();
      const token = simulatorTokens(condition.value).find((candidate) => text.includes(candidate));
      matched = token !== undefined;
      signal = token ? `Found "${token}" in ${condition.field ?? 'title_and_body'}.` : 'No keyword or phrase matched.';
      break;
    }
    case 'regex': {
      const text = conditionFieldText(post, condition.field);
      try {
        const pattern = new RegExp(condition.value, 'i');
        matched = pattern.test(text);
        signal = matched ? `Pattern /${condition.value}/ matched.` : `Pattern /${condition.value}/ did not match.`;
      } catch {
        signal = 'Regex pattern is invalid.';
      }
      break;
    }
    case 'post_type': {
      const types = simulatorTokens(condition.value);
      matched = types.includes(post.postType);
      signal = matched ? `Post type is ${post.postType}.` : `Post type is ${post.postType}, expected ${condition.value || 'a configured type'}.`;
      break;
    }
    case 'flair': {
      const flair = normalizeSimulatorText(post.flairText).toLowerCase();
      const token = simulatorTokens(condition.value).find((candidate) => flair.includes(candidate));
      matched = token !== undefined;
      signal = token ? `Flair contains "${token}".` : 'Flair did not match.';
      break;
    }
    case 'url_domain': {
      const domain = simulatorDomain(post.url);
      const targets = simulatorTokens(condition.value);
      matched = domain !== undefined && targets.some((target) => domain === target || domain.endsWith(`.${target}`));
      signal = domain ? `URL domain is ${domain}.` : 'No valid URL domain found.';
      break;
    }
    case 'title_length': {
      const length = normalizeSimulatorText(post.title).length;
      matched = (condition.min === undefined || length >= condition.min) && (condition.max === undefined || length <= condition.max);
      signal = `Title length is ${length} characters.`;
      break;
    }
    case 'body_length': {
      const length = normalizeSimulatorText(post.body).length;
      matched = (condition.min === undefined || length >= condition.min) && (condition.max === undefined || length <= condition.max);
      signal = `Body length is ${length} characters.`;
      break;
    }
    case 'day_of_week': {
      const day = simulatorDay(date, timezone);
      matched = (condition.days ?? []).some((candidate) => candidate.toLowerCase() === day.toLowerCase());
      signal = `Sample local day is ${day}.`;
      break;
    }
    case 'time_window': {
      const hour = simulatorHour(date, timezone);
      matched = (condition.min === undefined || hour >= condition.min) && (condition.max === undefined || hour <= condition.max);
      signal = `Sample local hour is ${hour}:00.`;
      break;
    }
    case 'semantic':
      semantic = true;
      matched = false;
      signal = `Semantic category "${condition.value || 'custom'}" requires LLM classification.`;
      break;
  }

  const effectiveMatch = condition.negate && !semantic ? !matched : matched;
  return {
    label,
    matched: effectiveMatch,
    signal: condition.negate && !semantic ? `NOT condition: ${signal}` : signal,
    semantic,
  };
}

// ── Data hooks ─────────────────────────────────────────────────────────────

function useDashboard(): [LoadState, () => Promise<void>] {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const load = useCallback(async () => {
    try {
      setState({ status: 'loading' });
      const [cr, rr] = await Promise.all([fetch('/api/cases'), fetch('/api/rules/v2')]);
      if (!cr.ok) { const b = await cr.json().catch(() => undefined) as { error?: string } | undefined; throw new Error(b?.error ?? `Failed (${cr.status})`); }
      if (!rr.ok) { const b = await rr.json().catch(() => undefined) as { error?: string } | undefined; throw new Error(b?.error ?? `Failed (${rr.status})`); }
      const cases = (await cr.json()) as CasesResponse;
      const rules = (await rr.json()) as RulesResponse;
      setState({ status: 'ready', cases: cases.cases, stats: cases.stats, settings: cases.settings, rules: rules.rules });
    } catch (e) { setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return [state, load];
}

// ── Cases Tab Components ───────────────────────────────────────────────────

function StatBand({ stats }: { stats: DashboardStats }) {
  return (
    <section className="stat-band" aria-label="RulePilot case totals">
      <div><span className="stat-label">Cases</span><strong>{stats.totalCases}</strong></div>
      <div><span className="stat-label">Filtered</span><strong>{stats.actionCounts.filtered}</strong></div>
      <div><span className="stat-label">Flagged</span><strong>{stats.actionCounts.flagged}</strong></div>
      <div><span className="stat-label">False positives</span><strong>{stats.falsePositiveRate > 0 ? pct(stats.falsePositiveRate) : '0%'}</strong></div>
    </section>
  );
}

function FeedbackButton({ postId, feedback, onSaved, children }: { postId: string; feedback: CaseFeedback; onSaved: () => Promise<void>; children: string }) {
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, feedback }) }); if (!r.ok) throw new Error(`${r.status}`); await onSaved(); } finally { setSaving(false); }
  };
  return <button className="secondary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving' : children}</button>;
}

function ruleTitle(rules: RuleConfigV2[], ruleId: string | null): string {
  return ruleId ? (rules.find((r) => r.id === ruleId)?.title ?? ruleId) : 'No rule';
}

function RoutingPanel({ item, rule }: { item: CaseRecord; rule: RuleConfigV2 | undefined }) {
  const redirect = redirectForRule(rule);
  const [copied, setCopied] = useState(false);
  if (!redirect) return null;
  const href = item.postPermalink ? new URL(item.postPermalink, 'https://www.reddit.com').toString() : undefined;
  const targetUrl = redirectTargetUrl(redirect);
  const draftUrl = createSubredditDraftUrl({
    redirect,
    postTitle: item.postTitle,
    postPermalink: href,
  });
  const copyGuidance = async () => {
    try {
      await navigator.clipboard.writeText(redirect.template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy routing guidance', redirect.template);
    }
  };
  return (
    <section className="detail-section routing-panel">
      <div className="routing-heading">
        <div>
          <h3>Routing guidance</h3>
          <span>{redirect.legacy ? 'Legacy guidance' : redirect.targetType}</span>
        </div>
        <strong>{redirect.target}</strong>
      </div>
      <p>{redirect.template}</p>
      <div className="routing-actions">
        <button className="secondary-button" type="button" onClick={() => void copyGuidance()}>{copied ? 'Copied' : 'Copy guidance'}</button>
        {targetUrl ? <a className="secondary-button link-button" href={targetUrl} rel="noreferrer" target="_blank">Open target</a> : null}
        {draftUrl ? <a className="secondary-button link-button" href={draftUrl} rel="noreferrer" target="_blank">Create draft to {redirect.target}</a> : null}
      </div>
    </section>
  );
}

function RepairPanel({ item, rule }: { item: CaseRecord; rule: RuleConfigV2 | undefined }) {
  const [copied, setCopied] = useState(false);
  const template = rule?.repairTemplate?.trim();
  if (!template) return null;
  const href = item.postPermalink ? new URL(item.postPermalink, 'https://www.reddit.com').toString() : undefined;
  const draftUrl = createRepairDraftUrl({
    subredditName: item.subredditName,
    postTitle: item.postTitle,
    postPermalink: href,
    repairTemplate: template,
  });
  const copyRepair = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy fixed-post guidance', template);
    }
  };
  return (
    <section className="detail-section repair-panel">
      <div className="routing-heading">
        <div>
          <h3>Fixed-post draft</h3>
          <span>{rule?.repairStrategy ? REPAIR_STRATEGIES.find((item) => item.value === rule.repairStrategy)?.label ?? rule.repairStrategy : 'Guidance'}</span>
        </div>
      </div>
      <p>{template}</p>
      <div className="routing-actions">
        <button className="secondary-button" type="button" onClick={() => void copyRepair()}>{copied ? 'Copied' : 'Copy fix guidance'}</button>
        {draftUrl ? <a className="secondary-button link-button" href={draftUrl} rel="noreferrer" target="_blank">Create fixed draft</a> : null}
      </div>
    </section>
  );
}

function CaseTable({ cases, rules, selectedId, onSelect }: { cases: CaseRecord[]; rules: RuleConfigV2[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const selectedIndex = Math.max(0, cases.findIndex((item) => item.id === selectedId));
  const focusRow = (index: number) => {
    const next = cases[index];
    if (!next) return;
    onSelect(next.id);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTableRowElement>(`[data-case-row-index="${index}"]`)?.focus();
    });
  };
  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(Math.min(cases.length - 1, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(Math.max(0, index - 1));
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(cases.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (cases[index]) onSelect(cases[index].id);
        break;
    }
  };

  return (
    <div className="case-table-wrap">
      <table className="case-table">
        <thead><tr><th scope="col">Post</th><th scope="col">Rule</th><th scope="col">Confidence</th><th scope="col">Action</th><th scope="col">Feedback</th><th scope="col">Updated</th></tr></thead>
        <tbody>{cases.map((item, index) => (
          <tr
            aria-selected={item.id === selectedId}
            className={item.id === selectedId ? 'selected-row' : undefined}
            data-case-row-index={index}
            key={item.id}
            onKeyDown={(event) => handleRowKeyDown(event, index)}
            tabIndex={index === selectedIndex ? 0 : -1}
          >
            <td className="post-cell"><button className="title-button" type="button" onClick={() => onSelect(item.id)}><span>{item.postTitle}</span><small>{item.result.source}</small></button></td>
            <td>{ruleTitle(rules, item.result.ruleId)}</td>
            <td><span className="confidence-meter" style={{ '--value': `${Math.round(item.result.confidence * 100)}%` } as CSSProperties}><span>{pct(item.result.confidence)}</span></span></td>
            <td><span className={`status-pill action-${item.action}`}>{actionLabels[item.action]}</span></td>
            <td><span className={`feedback-pill ${item.feedback ? `feedback-${item.feedback}` : 'feedback-pending'}`}>{item.feedback ? feedbackLabels[item.feedback] : 'Pending'}</span></td>
            <td>{formatCompactTime(item.updatedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function CaseDetail({ item, rules, onSaved }: { item: CaseRecord | undefined; rules: RuleConfigV2[]; onSaved: () => Promise<void> }) {
  if (!item) return <aside className="detail-panel empty-detail" aria-label="Case detail"><strong>No cases selected</strong><span>New scans will appear here after RulePilot reviews posts.</span></aside>;
  const href = item.postPermalink ? new URL(item.postPermalink, 'https://www.reddit.com').toString() : undefined;
  const signals = item.result.matchedSignals.length ? item.result.matchedSignals : ['No deterministic signal recorded'];
  const evidence = item.result.evidence ?? [];
  const matchedRule = item.result.ruleId ? rules.find((rule) => rule.id === item.result.ruleId) : undefined;
  return (
    <aside className="detail-panel" aria-label="Case detail">
      <div className="detail-header"><span className={`status-pill action-${item.action}`}>{actionLabels[item.action]}</span><span className={`feedback-pill ${item.feedback ? `feedback-${item.feedback}` : 'feedback-pending'}`}>{item.feedback ? feedbackLabels[item.feedback] : 'Pending'}</span></div>
      <h2>{item.postTitle}</h2>
      <div className="detail-meta"><span>{ruleTitle(rules, item.result.ruleId)}</span><span>{pct(item.result.confidence)}</span><span>{formatTime(item.updatedAt)}</span></div>
      <section className="detail-section"><h3>Rationale</h3><p>{item.result.rationale}</p>{item.result.actionReason ? <p className="action-reason">{item.result.actionReason}</p> : null}</section>
      {evidence.length ? <section className="detail-section"><h3>Evidence</h3><ul>{evidence.map((evidenceItem, index) => <li key={`${evidenceItem.field}-${index}`}><strong>{evidenceItem.field}</strong>{evidenceItem.excerpt ? `: ${evidenceItem.excerpt}` : ''}<span>{evidenceItem.note}</span></li>)}</ul></section> : null}
      <section className="detail-section"><h3>Signals</h3><ul>{signals.map((s) => <li key={s}>{s}</li>)}</ul></section>
      <RoutingPanel item={item} rule={matchedRule} />
      <RepairPanel item={item} rule={matchedRule} />
      <section className="detail-section"><h3>Review</h3><div className="detail-actions"><FeedbackButton postId={item.postId} feedback="correct" onSaved={onSaved}>Correct</FeedbackButton><FeedbackButton postId={item.postId} feedback="false_positive" onSaved={onSaved}>False positive</FeedbackButton></div>{item.actionError ? <p className="error-note">{item.actionError}</p> : null}</section>
      {href ? <a className="post-link" href={href} rel="noreferrer" target="_blank">Open post</a> : null}
    </aside>
  );
}

function CasesWorkspace({ cases, rules, refresh }: { cases: CaseRecord[]; rules: RuleConfigV2[]; refresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.id ?? null);
  useEffect(() => { if (!cases.length) { setSelectedId(null); return; } if (!selectedId || !cases.some((i) => i.id === selectedId)) setSelectedId(cases[0]?.id ?? null); }, [cases, selectedId]);
  return (
    <div className="workspace-grid">
      <section className="cases-panel"><div className="panel-heading"><div><h2>Recent Cases</h2><span>{cases.length} shown</span></div></div>{cases.length ? <CaseTable cases={cases} rules={rules} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="empty-panel"><strong>No scanned posts yet</strong><span>Run a playtest submission or use the post menu action to scan an existing post.</span></div>}</section>
      <CaseDetail item={cases.find((i) => i.id === selectedId)} rules={rules} onSaved={refresh} />
    </div>
  );
}

function SettingsPopover({ settings }: { settings: RulePilotSettings }) {
  return (
    <section className="settings-popover" aria-label="Current RulePilot settings">
      <div><span>Mode</span><strong>{settings.scanMode}</strong></div>
      <div><span>LLM</span><strong>{settings.llmEnabled ? settings.openAiModel : 'off'}</strong></div>
      <div><span>Threshold</span><strong>{pct(settings.confidenceThreshold)}</strong></div>
      <div><span>Timezone</span><strong>{settings.timezone}</strong></div>
    </section>
  );
}

// ── Rule Studio Components ─────────────────────────────────────────────────

function emptyCondition(): RuleCondition {
  return { type: 'keyword', field: 'title_and_body', value: '' };
}

function emptyRule(): Partial<RuleConfigV2> {
  return { title: '', description: '', examples: [], negativeExamples: [], action: 'flag', threshold: 0.76, category: 'quality', enabled: false, conditions: [emptyCondition()], redirect: '', modNotes: '' };
}

function ConditionRow({ condition, onChange, onRemove }: { condition: RuleCondition; onChange: (c: RuleCondition) => void; onRemove: () => void }) {
  const needsField = ['keyword', 'regex'].includes(condition.type);
  const needsDays = condition.type === 'day_of_week';
  const needsRange = ['title_length', 'body_length', 'time_window'].includes(condition.type);
  return (
    <div className="condition-row">
      <select value={condition.type} onChange={(e) => onChange({ ...condition, type: e.target.value as ConditionType })}>
        {(Object.keys(conditionTypeLabels) as ConditionType[]).map((t) => <option key={t} value={t}>{conditionTypeLabels[t]}</option>)}
      </select>
      {needsField && <select value={condition.field ?? 'title_and_body'} onChange={(e) => onChange({ ...condition, field: e.target.value as ConditionField })}><option value="title">Title</option><option value="body">Body</option><option value="title_and_body">Title + Body</option><option value="flair">Flair</option><option value="url">URL</option></select>}
      {needsDays ? (
        <div className="days-picker">{DAYS.map((d) => <label key={d} className="day-chip"><input type="checkbox" checked={condition.days?.includes(d) ?? false} onChange={(e) => { const days = condition.days ? [...condition.days] : []; if (e.target.checked) days.push(d); else { const i = days.indexOf(d); if (i >= 0) days.splice(i, 1); } onChange({ ...condition, days }); }} />{d.slice(0, 3)}</label>)}</div>
      ) : needsRange ? (
        <div className="range-inputs"><input type="number" placeholder="Min" value={condition.min ?? ''} onChange={(e) => { const c = { ...condition }; if (e.target.value) { c.min = Number(e.target.value); } else { delete c.min; } onChange(c); }} /><input type="number" placeholder="Max" value={condition.max ?? ''} onChange={(e) => { const c = { ...condition }; if (e.target.value) { c.max = Number(e.target.value); } else { delete c.max; } onChange(c); }} /></div>
      ) : (
        <input type="text" placeholder={condition.type === 'semantic' ? 'Category label (e.g. spam, rude)' : 'Value (pipe-separated)'} value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} />
      )}
      <label className="negate-toggle"><input type="checkbox" checked={condition.negate ?? false} onChange={(e) => onChange({ ...condition, negate: e.target.checked })} />NOT</label>
      <button className="condition-remove-button" type="button" onClick={onRemove} title="Remove condition">✕</button>
    </div>
  );
}

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('');
  const add = () => { const v = input.trim(); if (v && !tags.includes(v)) { onChange([...tags, v]); setInput(''); } };
  return (
    <div className="tag-input-wrap">
      <div className="tag-list">{tags.map((t) => <span key={t} className="tag">{t}<button type="button" onClick={() => onChange(tags.filter((x) => x !== t))}>✕</button></span>)}</div>
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} />
    </div>
  );
}

function RuleSimulator({ rule, timezone }: { rule: Partial<RuleConfigV2>; timezone: string }) {
  const [expanded, setExpanded] = useState(false);
  const [sample, setSample] = useState<SimulatorPost>({
    title: rule.examples?.[0] ?? 'Resume review for summer internship applications',
    body: '',
    flairText: '',
    url: '',
    postType: 'text',
    createdAt: '2026-05-18T12:00',
  });
  const conditions = rule.conditions ?? [];
  const results = useMemo(
    () => conditions.map((condition) => evaluateSimulatorCondition(condition, sample, timezone)),
    [conditions, sample, timezone]
  );
  const deterministicResults = results.filter((result) => !result.semantic);
  const semanticCount = results.length - deterministicResults.length;
  const deterministicMatch = deterministicResults.length > 0 && deterministicResults.every((result) => result.matched) && semanticCount === 0;
  const deterministicPreconditionsPass = deterministicResults.length === 0 || deterministicResults.every((result) => result.matched);
  const outcome = semanticCount > 0
    ? (deterministicPreconditionsPass ? 'Needs LLM' : 'Preconditions missed')
    : (deterministicMatch ? 'Would match' : 'Would not match');
  const outcomeClass = deterministicMatch ? 'simulator-match' : semanticCount > 0 && deterministicPreconditionsPass ? 'simulator-llm' : 'simulator-miss';

  return (
    <section className="rule-simulator" aria-label="Rule simulator">
      <div className="simulator-header">
        <div>
          <button
            aria-expanded={expanded}
            className="simulator-toggle"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span aria-hidden="true">{expanded ? 'v' : '>'}</span>
            <strong>Simulator</strong>
          </button>
          <span className="simulator-subtitle">Test this draft against one sample post before saving.</span>
        </div>
        {expanded ? <span className={`simulator-outcome ${outcomeClass}`}>{outcome}</span> : null}
      </div>
      {expanded ? (
        <>
          <div className="simulator-grid">
            <label className="editor-field"><span>Sample title</span><input type="text" value={sample.title} onChange={(e) => setSample({ ...sample, title: e.target.value })} /></label>
            <label className="editor-field"><span>Flair</span><input type="text" value={sample.flairText} onChange={(e) => setSample({ ...sample, flairText: e.target.value })} placeholder="Optional" /></label>
            <label className="editor-field"><span>Post type</span><select value={sample.postType} onChange={(e) => setSample({ ...sample, postType: e.target.value as PostType })}>{POST_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="editor-field"><span>Local datetime</span><input type="datetime-local" value={sample.createdAt} onChange={(e) => setSample({ ...sample, createdAt: e.target.value })} /></label>
            <label className="editor-field full"><span>Body</span><textarea rows={2} value={sample.body} onChange={(e) => setSample({ ...sample, body: e.target.value })} placeholder="Optional sample body" /></label>
            <label className="editor-field full"><span>URL</span><input type="text" value={sample.url} onChange={(e) => setSample({ ...sample, url: e.target.value })} placeholder="https://example.com/post" /></label>
          </div>
          <div className="simulator-results">
            {results.length ? results.map((result, index) => (
              <div className={`simulator-result ${result.semantic ? 'simulator-result-llm' : result.matched ? 'simulator-result-match' : 'simulator-result-miss'}`} key={`${result.label}-${index}`}>
                <strong>{result.semantic ? 'LLM' : result.matched ? 'Match' : 'Miss'}</strong>
                <span>{result.label}</span>
                <p>{result.signal}</p>
              </div>
            )) : <div className="simulator-empty">Add at least one condition to simulate this rule.</div>}
          </div>
        </>
      ) : null}
    </section>
  );
}

function redirectTargetPlaceholder(targetType: RedirectTargetType | undefined): string {
  switch (targetType) {
    case 'subreddit':
      return 'r/cscareerquestions';
    case 'megathread':
      return 'Megathread title or https://www.reddit.com/r/.../comments/...';
    case 'url':
      return 'https://www.reddit.com/r/example/wiki/resource';
    case 'custom':
      return 'Moderator-facing target label';
    default:
      return 'No target configured';
  }
}

function RedirectEditor({ form, setForm }: { form: Partial<RuleConfigV2>; setForm: (rule: Partial<RuleConfigV2>) => void }) {
  const currentType = form.redirectTargetType;
  const target = form.redirectTarget ?? '';
  const template = form.redirectTemplate ?? form.redirect ?? '';
  const applyPreset = (presetId: string) => {
    const preset = REDIRECT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setForm({
      ...form,
      redirectTargetType: preset.redirectTargetType,
      redirectTarget: preset.redirectTarget,
      redirectTemplate: preset.redirectTemplate,
      redirect: preset.redirectTemplate,
    });
  };
  return (
    <section className="redirect-editor">
      <div className="redirect-editor-heading">
        <div>
          <h3>Redirect guidance</h3>
          <span>Shown to moderators after this rule matches. RulePilot will not DM, comment, or repost automatically.</span>
        </div>
      </div>
      <div className="redirect-preset-row">
        <label className="editor-field">
          <span>Preset</span>
          <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="" disabled>Choose a template</option>
            {REDIRECT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <label className="editor-field">
          <span>Target type</span>
          <select
            value={currentType ?? ''}
            onChange={(e) => setForm({ ...form, redirectTargetType: e.target.value ? e.target.value as RedirectTargetType : undefined })}
          >
            <option value="">None</option>
            {REDIRECT_TARGET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="editor-field">
          <span>Target</span>
          <input
            type="text"
            value={target}
            onChange={(e) => setForm({ ...form, redirectTarget: e.target.value })}
            placeholder={redirectTargetPlaceholder(currentType)}
          />
        </label>
      </div>
      <label className="editor-field full">
        <span>Template</span>
        <textarea
          rows={3}
          value={template}
          onChange={(e) => setForm({ ...form, redirectTemplate: e.target.value, redirect: e.target.value })}
          placeholder="Moderator-facing guidance to copy into a removal reason, comment, or mod note."
        />
      </label>
    </section>
  );
}

function RepairEditor({ form, setForm }: { form: Partial<RuleConfigV2>; setForm: (rule: Partial<RuleConfigV2>) => void }) {
  return (
    <section className="redirect-editor">
      <div className="redirect-editor-heading">
        <div>
          <h3>Fixed-post draft</h3>
          <span>Optional mod-facing guidance for violations the author can fix and repost. RulePilot opens a draft; it does not DM, schedule, or copy the original body.</span>
        </div>
      </div>
      <div className="redirect-preset-row">
        <label className="editor-field">
          <span>Repair type</span>
          <select
            value={form.repairStrategy ?? ''}
            onChange={(e) => setForm({ ...form, repairStrategy: e.target.value ? e.target.value as RepairStrategy : undefined })}
          >
            <option value="">None</option>
            {REPAIR_STRATEGIES.map((strategy) => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}
          </select>
        </label>
        <label className="editor-field full">
          <span>Fix guidance</span>
          <textarea
            rows={3}
            value={form.repairTemplate ?? ''}
            onChange={(e) => setForm({ ...form, repairTemplate: e.target.value })}
            placeholder="Example: Please add course context, what you tried, and the specific question before reposting."
          />
        </label>
      </div>
    </section>
  );
}

function EditorDivider({ label }: { label: string }) {
  return <div className="editor-divider"><span>{label}</span></div>;
}

function RuleEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
  saving,
  timezone,
}: {
  initial: Partial<RuleConfigV2>;
  onSave: (r: Partial<RuleConfigV2>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  timezone: string;
}) {
  const [form, setForm] = useState<Partial<RuleConfigV2>>({ ...initial });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conditions = form.conditions ?? [];
  const setConditions = (c: RuleCondition[]) => setForm({ ...form, conditions: c });
  const selectedRoutingAction = routingActionDefinition(form.action ?? 'flag');

  useEffect(() => {
    setConfirmDelete(false);
  }, [initial.id]);

  return (
    <div className="rule-editor">
      <div className="editor-grid">
        <label className="editor-field"><span>Title</span><input type="text" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Rule title" /></label>
        <label className="editor-field"><span>Category</span><select value={form.category ?? 'quality'} onChange={(e) => setForm({ ...form, category: e.target.value as RuleCategory })}>{(Object.keys(categoryLabels) as RuleCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
      </div>
      <label className="editor-field full"><span>Description</span><textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Plain-English description of what this rule catches" /></label>
      <EditorDivider label="Conditions" />
      <div className="editor-field full"><span>Positive examples (should match)</span><TagInput tags={form.examples ?? []} onChange={(t) => setForm({ ...form, examples: t })} placeholder="Add example and press Enter" /></div>
      <div className="editor-field full"><span>Negative examples (should NOT match)</span><TagInput tags={form.negativeExamples ?? []} onChange={(t) => setForm({ ...form, negativeExamples: t })} placeholder="Add counter-example and press Enter" /></div>
      <div className="editor-field full">
        <span>Conditions</span>
        {conditions.map((c, i) => <ConditionRow key={i} condition={c} onChange={(nc) => { const a = [...conditions]; a[i] = nc; setConditions(a); }} onRemove={() => setConditions(conditions.filter((_, j) => j !== i))} />)}
        <button className="secondary-button add-condition-btn" type="button" onClick={() => setConditions([...conditions, emptyCondition()])}>+ Add condition</button>
      </div>
      <RuleSimulator rule={form} timezone={timezone} />
      <label className="editor-field threshold-field"><span>Threshold</span><input type="number" step="0.01" min="0.01" max="0.99" value={form.threshold ?? 0.76} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} /></label>
      <EditorDivider label="Actions" />
      <label className="editor-field routing-action-field"><span>Routing action</span><select value={form.action ?? 'flag'} onChange={(e) => setForm({ ...form, action: e.target.value as RuleAction })}>{ROUTING_ACTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select><small>{selectedRoutingAction.description}</small></label>
      <RedirectEditor form={form} setForm={setForm} />
      <RepairEditor form={form} setForm={setForm} />
      <label className="editor-field full"><span>Mod notes (internal)</span><textarea rows={2} value={form.modNotes ?? ''} onChange={(e) => setForm({ ...form, modNotes: e.target.value })} placeholder="Internal notes only visible to moderators" /></label>
      <div className="editor-actions">
        <div className="editor-actions-left">
          <button className="primary-button" disabled={saving || !form.title?.trim()} onClick={() => onSave(form)} type="button">{saving ? 'Saving...' : (initial.id ? 'Save changes' : 'Create rule')}</button>
          <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
        </div>
        {onDelete ? (
          <div className="editor-delete-zone">
            {confirmDelete ? (
              <div className="editor-delete-confirm" role="group" aria-label="Confirm rule deletion">
                <span>Delete this rule?</span>
                <button className="secondary-button" onClick={() => setConfirmDelete(false)} type="button">Cancel</button>
                <button className="secondary-button danger-text" disabled={saving} onClick={onDelete} type="button">Delete</button>
              </div>
            ) : (
              <button className="secondary-button danger-text editor-delete-button" disabled={saving} onClick={() => setConfirmDelete(true)} type="button">Delete rule</button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RuleBuilder({ onDraft, onClose }: { onDraft: (rule: RuleConfigV2) => void; onClose: () => void }) {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);

  const handleBuilderResponse = async (response: Response): Promise<RuleBuilderResponse> => {
    const raw = await response.text();
    let body: (RuleBuilderResponse & ErrorResponse) | undefined;
    try {
      body = raw ? JSON.parse(raw) as RuleBuilderResponse & ErrorResponse : undefined;
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      const details = body?.details?.filter(Boolean) ?? (raw ? [`Raw response: ${raw.slice(0, 500)}`] : []);
      const suffix = details.length ? `\n${details.map((detail) => `- ${detail}`).join('\n')}` : '';
      throw new Error(`${body?.error ?? `Rule Builder failed (${response.status})`}${suffix}`);
    }
    if (!body) {
      throw new Error('Rule Builder returned an empty response.');
    }
    return body;
  };

  const draftFromBody = async (label: string, body: unknown) => {
    setLoading(label);
    setError(null);
    setQuestions([]);
    try {
      const response = await fetch('/api/rules/v2/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await handleBuilderResponse(response);
      if (result.status === 'needs_clarification') {
        setQuestions(result.questions);
      } else {
        onDraft(result.rule);
        setIntent('');
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="rule-builder">
      <div className="rule-builder-heading">
        <div>
          <h3>RulePilot AI Builder</h3>
          <span>Generate disabled drafts for moderators to review, simulate, and save.</span>
        </div>
        <button className="secondary-button" disabled={loading !== null} onClick={onClose} type="button">Close</button>
      </div>
      <div className="builder-prompt-row">
        <label className="editor-field full">
          <span>Describe the rule you want</span>
          <textarea rows={3} value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Example: only allow satire / ragebait posts on Sundays" />
        </label>
        <button className="primary-button" disabled={loading !== null || !intent.trim()} onClick={() => void draftFromBody('natural', { mode: 'natural_language', intent })}>
          {loading === 'natural' ? (
            <span className="drafting-label">
              <span>Drafting</span>
              <span className="drafting-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
          ) : 'Draft rule'}
        </button>
      </div>
      {questions.length ? <div className="builder-note"><strong>Needs clarification</strong><ul>{questions.map((question) => <li key={question}>{question}</li>)}</ul></div> : null}
      {error ? <div className="rule-studio-error" role="alert">{error}</div> : null}
    </section>
  );
}

function RuleBuilderModal({ onDraft, onClose }: { onDraft: (rule: RuleConfigV2) => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="rule-builder-dialog" aria-label="Create a RulePilot rule" onClick={(event) => event.stopPropagation()}>
        <RuleBuilder onDraft={onDraft} onClose={onClose} />
      </section>
    </div>
  );
}

function RuleStudioRow({ rule, onEdit, onToggle }: { rule: RuleConfigV2; onEdit: () => void; onToggle: (enabled: boolean) => void }) {
  return (
    <div className={`rs-row ${rule.enabled ? '' : 'rs-row-disabled'}`}>
      <div className="rs-row-main">
        <label className="toggle-switch"><input type="checkbox" checked={rule.enabled} onChange={(e) => onToggle(e.target.checked)} /><span className="toggle-track" /></label>
        <div className="rs-row-info">
          <strong>{rule.title}</strong>
          <span className={`status-pill action-${routingActionStatusClass(rule.action)}`}>{routingActionLabel(rule.action)}</span>
        </div>
      </div>
      <div className="rs-row-actions">
        <button className="secondary-button" onClick={onEdit}>Edit</button>
      </div>
    </div>
  );
}

function RuleStudio({ rules, refresh, timezone }: { rules: RuleConfigV2[]; refresh: () => Promise<void>; timezone: string }) {
  const [localRules, setLocalRules] = useState<RuleConfigV2[]>(rules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RuleConfigV2[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [subredditRulesImported, setSubredditRulesImported] = useState(() => {
    try {
      return window.localStorage.getItem(SUBREDDIT_RULE_IMPORT_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setLocalRules(rules);
    setNeedsRefresh(false);
  }, [rules]);

  const applyRuleMutation = async (response: Response, message: string) => {
    await requireOk(response, message);
    const body = await response.json() as { rules?: RuleConfigV2[] };
    if (!body.rules) {
      throw new Error(message);
    }
    setLocalRules(body.rules);
    setNeedsRefresh(true);
  };

  const refreshFromServer = async () => {
    setError(null);
    try {
      await refresh();
      setNeedsRefresh(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    setError(null);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      await applyRuleMutation(response, 'Could not update rule state');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleDelete = async (ruleId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}`, { method: 'DELETE' });
      await applyRuleMutation(response, 'Could not delete rule');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleSaveDraft = async (draftId: string, form: Partial<RuleConfigV2>) => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/rules/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, enabled: false }),
      });
      await applyRuleMutation(response, 'Could not save draft rule');
      setDrafts((items) => items.filter((item) => item.id !== draftId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };
  const handleSaveEdit = async (ruleId: string, form: Partial<RuleConfigV2>) => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      await applyRuleMutation(response, 'Could not save rule');
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };
  const handleExport = async () => {
    setError(null);
    try {
      const r = await fetch('/api/rules/v2/export');
      await requireOk(r, 'Could not export rules');
      const d = await r.json() as { rules: RuleConfigV2[] };
      const blob = new Blob([JSON.stringify(d.rules, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rulepilot-rules.json'; a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      setError(null);
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as unknown;
        if (!Array.isArray(imported)) {
          throw new Error('Import file must contain a JSON array of rules.');
        }
        const response = await fetch('/api/rules/v2/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: imported }) });
        await applyRuleMutation(response, 'Could not import rules');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  };
  const importSubredditRules = async () => {
    setActionLoading('subreddit-import');
    setError(null);
    try {
      const response = await fetch('/api/rules/v2/import-subreddit-rules', { method: 'POST' });
      const body = await response.json().catch(() => undefined) as { drafts?: RuleConfigV2[]; errors?: string[]; error?: string } | undefined;
      if (!response.ok) {
        throw new Error(body?.error ?? `Import failed (${response.status})`);
      }
      const importedDrafts = body?.drafts ?? [];
      if (importedDrafts.length === 0) {
        throw new Error(body?.errors?.join(' ') || 'No draftable subreddit rules were returned.');
      }
      setDrafts((current) => [...current, ...importedDrafts]);
      setEditingId(null);
      setBuilderOpen(false);
      setSubredditRulesImported(true);
      try {
        window.localStorage.setItem(SUBREDDIT_RULE_IMPORT_KEY, 'true');
      } catch {
        // Non-critical in embedded webviews that block localStorage.
      }
      if (body?.errors?.length) {
        setError(body.errors.slice(0, 3).join(' '));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };
  const openRuleBuilder = () => {
    setEditingId(null);
    setBuilderOpen(true);
  };

  return (
    <div className="rule-studio-wrap">
      <section className="rule-studio">
        <div className="rs-header">
          <div><h2>Rule Studio</h2><span>{localRules.length} rules</span></div>
        </div>
        {error ? <div className="rule-studio-error" role="alert">{error}</div> : null}
        {needsRefresh ? <div className="rule-studio-sync"><span>Rule changes saved.</span><button className="secondary-button" type="button" onClick={() => void refreshFromServer()}>Save changes</button></div> : null}
        <div className="rs-list">
          {localRules.map((rule) => (
            <div key={rule.id}>
              <RuleStudioRow rule={rule} onEdit={() => { setEditingId(rule.id); }} onToggle={(e) => void handleToggle(rule.id, e)} />
              {editingId === rule.id && (
                <RuleEditor
                  initial={rule}
                  onSave={(f) => void handleSaveEdit(rule.id, f)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => void handleDelete(rule.id)}
                  saving={saving}
                  timezone={timezone}
                />
              )}
            </div>
          ))}
          {drafts.map((draft) => (
            <div key={draft.id}>
              <div className="draft-banner">
                <strong>Generated draft</strong>
                <span>Review, simulate, and save. It will stay disabled until a moderator enables it.</span>
              </div>
              <RuleEditor
                initial={draft}
                onSave={(form) => void handleSaveDraft(draft.id, form)}
                onCancel={() => setDrafts((items) => items.filter((item) => item.id !== draft.id))}
                saving={saving}
                timezone={timezone}
              />
            </div>
          ))}
          {localRules.length === 0 && drafts.length === 0 && <div className="empty-panel"><strong>No rules yet</strong><span>Create a new rule or import an existing RulePilot rule file.</span></div>}
          <div className="rs-create-row">
            <button className="primary-button create-rule-button" onClick={openRuleBuilder} type="button">
              <span aria-hidden="true">+</span>
              <span>New Rule</span>
            </button>
          </div>
        </div>
      </section>
      <div className="rs-footer-actions" aria-label="Rule Studio actions">
        {!subredditRulesImported ? (
          <button className="secondary-button" disabled={actionLoading !== null || saving} onClick={() => void importSubredditRules()} type="button">
            {actionLoading === 'subreddit-import' ? 'Importing subreddit rules' : 'Import subreddit rules'}
          </button>
        ) : null}
        <button className="secondary-button" disabled={actionLoading !== null || saving} onClick={handleImport} type="button">Import</button>
        <button className="secondary-button" disabled={actionLoading !== null || saving} onClick={() => void handleExport()} type="button">Export</button>
      </div>
      {builderOpen ? <RuleBuilderModal onClose={() => setBuilderOpen(false)} onDraft={(rule) => {
        setEditingId(null);
        setDrafts((items) => [...items, rule]);
      }} /> : null}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ cases, stats, settings, rules, refresh }: { cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings; rules: RuleConfigV2[]; refresh: () => Promise<void> }) {
  const [tab, setTab] = useState<DashboardTab>('cases');
  const newest = useMemo(() => cases.slice(0, 25), [cases]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><h1>RulePilot</h1></div>
        <nav className="tab-bar">
          <button className={`tab-item ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>Cases</button>
          <button className={`tab-item ${tab === 'rule-studio' ? 'active' : ''}`} onClick={() => setTab('rule-studio')}>Rule Studio</button>
        </nav>
        <div className="topbar-actions">
          <div className="settings-menu">
            <button
              aria-label="Show settings summary"
              className="secondary-button icon-button settings-button"
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.8v2.4" />
                <path d="M12 18.8v2.4" />
                <path d="m4.2 6.1 1.7 1.7" />
                <path d="m18.1 16.2 1.7 1.7" />
                <path d="M2.8 12h2.4" />
                <path d="M18.8 12h2.4" />
                <path d="m4.2 17.9 1.7-1.7" />
                <path d="m18.1 7.8 1.7-1.7" />
              </svg>
            </button>
            <SettingsPopover settings={settings} />
          </div>
        </div>
      </header>
      {tab === 'cases' && (
        <>
          <div className="dashboard-grid">
            <CasesWorkspace cases={newest} rules={rules} refresh={refresh} />
            <StatBand stats={stats} />
          </div>
        </>
      )}
      {tab === 'rule-studio' && <RuleStudio rules={rules} refresh={refresh} timezone={settings.timezone} />}
    </main>
  );
}

function App() {
  const [state, refresh] = useDashboard();
  if (state.status === 'loading') return <main className="center-state">Loading RulePilot</main>;
  if (state.status === 'error') return <main className="center-state"><strong>Moderator access required</strong><span>{state.message}</span></main>;
  return <Dashboard cases={state.cases} stats={state.stats} settings={state.settings} rules={state.rules} refresh={refresh} />;
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
