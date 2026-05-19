import { useEffect, useMemo, useState, useCallback } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';

import type {
  CaseFeedback, CaseRecord, ConditionField, ConditionType, DashboardStats,
  DashboardTab, RuleAction, RuleCategory, RuleCondition, RuleConfigV2,
  RulePilotSettings,
} from '../shared/types';
import './styles.css';

// ── Types ──────────────────────────────────────────────────────────────────

type CasesResponse = { cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings };
type RulesResponse = { rules: RuleConfigV2[] };
type ErrorResponse = { error?: string };

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings; rules: RuleConfigV2[] }
  | { status: 'error'; message: string };

// ── Constants ──────────────────────────────────────────────────────────────

const actionLabels: Record<CaseRecord['action'], string> = {
  none: 'None', logged: 'Logged', flagged: 'Flagged', filtered: 'Filtered',
  filter_unavailable: 'Filter unavailable', error: 'Error',
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
const actionOptions: { value: RuleAction; label: string }[] = [
  { value: 'allow', label: 'Allow' }, { value: 'log', label: 'Log only' },
  { value: 'flag', label: 'Flag for review' }, { value: 'filter', label: 'Filter to mod queue' },
];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

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
  return (
    <aside className="detail-panel" aria-label="Case detail">
      <div className="detail-header"><span className={`status-pill action-${item.action}`}>{actionLabels[item.action]}</span><span className={`feedback-pill ${item.feedback ? `feedback-${item.feedback}` : 'feedback-pending'}`}>{item.feedback ? feedbackLabels[item.feedback] : 'Pending'}</span></div>
      <h2>{item.postTitle}</h2>
      <div className="detail-meta"><span>{ruleTitle(rules, item.result.ruleId)}</span><span>{pct(item.result.confidence)}</span><span>{formatTime(item.updatedAt)}</span></div>
      <section className="detail-section"><h3>Rationale</h3><p>{item.result.rationale}</p></section>
      <section className="detail-section"><h3>Signals</h3><ul>{signals.map((s) => <li key={s}>{s}</li>)}</ul></section>
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

function TopRules({ stats }: { stats: DashboardStats }) {
  return (
    <section className="rules-panel"><div className="panel-heading"><div><h2>Top Matches</h2><span>Last 75 cases</span></div></div>
      <div className="rule-list">{stats.topRules.length ? stats.topRules.map((r) => <div className="rule-row" key={r.ruleId}><span>{r.title}</span><strong>{r.count}</strong></div>) : <div className="empty-row">No cases yet</div>}</div>
    </section>
  );
}

function EnabledRuleList({ rules }: { rules: RuleConfigV2[] }) {
  const enabled = rules.filter((r) => r.enabled);
  return (
    <section className="rules-panel"><div className="panel-heading"><div><h2>Enabled Rules</h2><span>{enabled.length} active</span></div></div>
      <div className="rule-list">{enabled.map((r) => <div className="rule-row" key={r.id}><span>{r.title}</span><strong>{pct(r.threshold)}</strong></div>)}</div>
    </section>
  );
}

function SettingsSummary({ settings }: { settings: RulePilotSettings }) {
  return (
    <section className="settings-strip" aria-label="Current RulePilot settings">
      <span>Mode: {settings.scanMode}</span><span>LLM: {settings.llmEnabled ? settings.openAiModel : 'off'}</span>
      <span>Threshold: {pct(settings.confidenceThreshold)}</span><span>{settings.timezone}</span>
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
      <button className="icon-button" type="button" onClick={onRemove} title="Remove condition">✕</button>
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

function RuleEditor({ initial, onSave, onCancel, saving }: { initial: Partial<RuleConfigV2>; onSave: (r: Partial<RuleConfigV2>) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<Partial<RuleConfigV2>>({ ...initial });
  const conditions = form.conditions ?? [];
  const setConditions = (c: RuleCondition[]) => setForm({ ...form, conditions: c });
  return (
    <div className="rule-editor">
      <div className="editor-grid">
        <label className="editor-field"><span>Title</span><input type="text" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Rule title" /></label>
        <label className="editor-field"><span>Category</span><select value={form.category ?? 'quality'} onChange={(e) => setForm({ ...form, category: e.target.value as RuleCategory })}>{(Object.keys(categoryLabels) as RuleCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
        <label className="editor-field"><span>Action</span><select value={form.action ?? 'flag'} onChange={(e) => setForm({ ...form, action: e.target.value as RuleAction })}>{actionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="editor-field"><span>Threshold</span><input type="number" step="0.01" min="0.01" max="0.99" value={form.threshold ?? 0.76} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} /></label>
      </div>
      <label className="editor-field full"><span>Description</span><textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Plain-English description of what this rule catches" /></label>
      <div className="editor-field full"><span>Positive examples (should match)</span><TagInput tags={form.examples ?? []} onChange={(t) => setForm({ ...form, examples: t })} placeholder="Add example and press Enter" /></div>
      <div className="editor-field full"><span>Negative examples (should NOT match)</span><TagInput tags={form.negativeExamples ?? []} onChange={(t) => setForm({ ...form, negativeExamples: t })} placeholder="Add counter-example and press Enter" /></div>
      <div className="editor-field full">
        <span>Conditions</span>
        {conditions.map((c, i) => <ConditionRow key={i} condition={c} onChange={(nc) => { const a = [...conditions]; a[i] = nc; setConditions(a); }} onRemove={() => setConditions(conditions.filter((_, j) => j !== i))} />)}
        <button className="secondary-button add-condition-btn" type="button" onClick={() => setConditions([...conditions, emptyCondition()])}>+ Add condition</button>
      </div>
      <label className="editor-field full"><span>Redirect guidance</span><input type="text" value={form.redirect ?? ''} onChange={(e) => setForm({ ...form, redirect: e.target.value })} placeholder="e.g. Try r/cscareerquestions for career questions" /></label>
      <label className="editor-field full"><span>Mod notes (internal)</span><textarea rows={2} value={form.modNotes ?? ''} onChange={(e) => setForm({ ...form, modNotes: e.target.value })} placeholder="Internal notes only visible to moderators" /></label>
      <div className="editor-actions">
        <button className="primary-button" disabled={saving || !form.title?.trim()} onClick={() => onSave(form)}>{saving ? 'Saving…' : (initial.id ? 'Save changes' : 'Create rule')}</button>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RuleStudioRow({ rule, onEdit, onToggle, onDelete }: { rule: RuleConfigV2; onEdit: () => void; onToggle: (enabled: boolean) => void; onDelete: () => void }) {
  return (
    <div className={`rs-row ${rule.enabled ? '' : 'rs-row-disabled'}`}>
      <div className="rs-row-main">
        <label className="toggle-switch"><input type="checkbox" checked={rule.enabled} onChange={(e) => onToggle(e.target.checked)} /><span className="toggle-track" /></label>
        <div className="rs-row-info">
          <strong>{rule.title}</strong>
          <span className="rs-row-meta">
            <span className={`status-pill action-${rule.action === 'allow' ? 'none' : rule.action === 'log' ? 'logged' : rule.action === 'flag' ? 'flagged' : 'filtered'}`}>{actionOptions.find((o) => o.value === rule.action)?.label ?? rule.action}</span>
            <span className="rs-category-pill">{categoryLabels[rule.category]}</span>
            <span>{pct(rule.threshold)}</span>
            {rule.source === 'preset' && <span className="rs-preset-badge">Preset</span>}
            <span>{rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''}</span>
          </span>
        </div>
      </div>
      <div className="rs-row-actions">
        <button className="secondary-button" onClick={onEdit}>Edit</button>
        <button className="secondary-button danger-text" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function RuleStudio({ rules, refresh }: { rules: RuleConfigV2[]; refresh: () => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    setError(null);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      await requireOk(response, 'Could not update rule state');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleDelete = async (ruleId: string) => {
    if (!window.confirm('Delete this rule? This cannot be undone.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}`, { method: 'DELETE' });
      await requireOk(response, 'Could not delete rule');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleSaveNew = async (form: Partial<RuleConfigV2>) => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/rules/v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      await requireOk(response, 'Could not create rule');
      setCreating(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };
  const handleSaveEdit = async (ruleId: string, form: Partial<RuleConfigV2>) => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/rules/v2/${ruleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      await requireOk(response, 'Could not save rule');
      setEditingId(null);
      await refresh();
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
        await requireOk(response, 'Could not import rules');
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  };

  return (
    <section className="rule-studio">
      <div className="rs-header">
        <div><h2>Rule Studio</h2><span>{rules.length} rules</span></div>
        <div className="rs-header-actions">
          <button className="secondary-button" onClick={handleImport}>Import</button>
          <button className="secondary-button" onClick={() => void handleExport()}>Export</button>
          <button className="primary-button" onClick={() => { setCreating(true); setEditingId(null); }}>+ New Rule</button>
        </div>
      </div>
      {error ? <div className="rule-studio-error" role="alert">{error}</div> : null}
      {creating && <RuleEditor initial={emptyRule()} onSave={(f) => void handleSaveNew(f)} onCancel={() => setCreating(false)} saving={saving} />}
      <div className="rs-list">
        {rules.map((rule) => (
          <div key={rule.id}>
            <RuleStudioRow rule={rule} onEdit={() => { setEditingId(rule.id); setCreating(false); }} onToggle={(e) => void handleToggle(rule.id, e)} onDelete={() => void handleDelete(rule.id)} />
            {editingId === rule.id && <RuleEditor initial={rule} onSave={(f) => void handleSaveEdit(rule.id, f)} onCancel={() => setEditingId(null)} saving={saving} />}
          </div>
        ))}
        {rules.length === 0 && <div className="empty-panel"><strong>No rules yet</strong><span>Create a new rule or install the r/csMajors starter pack.</span></div>}
      </div>
    </section>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ cases, stats, settings, rules, refresh }: { cases: CaseRecord[]; stats: DashboardStats; settings: RulePilotSettings; rules: RuleConfigV2[]; refresh: () => Promise<void> }) {
  const [tab, setTab] = useState<DashboardTab>('cases');
  const newest = useMemo(() => cases.slice(0, 25), [cases]);
  return (
    <main>
      <header className="topbar">
        <div><h1>RulePilot</h1></div>
        <nav className="tab-bar">
          <button className={`tab-item ${tab === 'cases' ? 'active' : ''}`} onClick={() => setTab('cases')}>Cases</button>
          <button className={`tab-item ${tab === 'rule-studio' ? 'active' : ''}`} onClick={() => setTab('rule-studio')}>Rule Studio</button>
        </nav>
        <button className="primary-button" onClick={() => void refresh()}>Refresh</button>
      </header>
      {tab === 'cases' && (
        <>
          <SettingsSummary settings={settings} />
          <StatBand stats={stats} />
          <div className="dashboard-grid">
            <CasesWorkspace cases={newest} rules={rules} refresh={refresh} />
            <aside className="side-panels"><TopRules stats={stats} /><EnabledRuleList rules={rules} /></aside>
          </div>
        </>
      )}
      {tab === 'rule-studio' && <RuleStudio rules={rules} refresh={refresh} />}
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
