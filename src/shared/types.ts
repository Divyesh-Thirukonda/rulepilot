export type RuleAction = 'allow' | 'log' | 'flag' | 'filter';

export type RedirectTargetType = 'subreddit' | 'megathread' | 'url' | 'custom';

export type RuleCategory =
  | 'scope'
  | 'civility'
  | 'format'
  | 'quality'
  | 'repetition'
  | 'promotion'
  | 'sensitive'
  | 'megathread';

export type RuleConfig = {
  id: string;
  title: string;
  description: string;
  examples: string[];
  action: RuleAction;
  threshold: number;
  category: RuleCategory;
  redirect?: string;
  enabledByDefault: boolean;
};

// ---------------------------------------------------------------------------
// RuleConfigV2 — mod-built rules with structured conditions
// ---------------------------------------------------------------------------

export type ConditionType =
  | 'keyword'
  | 'regex'
  | 'post_type'
  | 'flair'
  | 'url_domain'
  | 'title_length'
  | 'body_length'
  | 'day_of_week'
  | 'time_window'
  | 'semantic';

export type ConditionField = 'title' | 'body' | 'title_and_body' | 'flair' | 'url';

export type RuleCondition = {
  type: ConditionType;
  /** Which post field the condition applies to. */
  field?: ConditionField | undefined;
  /** The value / pattern to match (keyword phrases pipe-separated, regex pattern, domain, semantic label, etc.). */
  value: string;
  /** For numeric range conditions (length, time). */
  min?: number | undefined;
  max?: number | undefined;
  /** For day_of_week: array of day names (e.g. ["Sunday"]). */
  days?: string[] | undefined;
  /** When true the condition matches when the check does NOT match (negation). */
  negate?: boolean | undefined;
};

export type RuleConfigV2 = {
  id: string;
  title: string;
  description: string;
  examples: string[];
  negativeExamples: string[];
  action: RuleAction;
  threshold: number;
  category: RuleCategory;
  enabled: boolean;
  redirectTargetType?: RedirectTargetType | undefined;
  redirectTarget?: string | undefined;
  redirectTemplate?: string | undefined;
  redirect?: string | undefined;
  modNotes?: string | undefined;
  conditions: RuleCondition[];
  createdAt: string;
  updatedAt: string;
  source: 'preset' | 'custom';
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type SuggestedAction = 'allow' | 'log' | 'flag_for_review' | 'filter_to_modqueue';

export type ClassificationDecision = 'allowed' | 'needs_review' | 'violation' | 'uncertain' | 'insufficient_context';

export type ClassificationSource = 'deterministic' | 'llm' | 'fallback';

export type ClassificationResult = {
  decision: ClassificationDecision;
  ruleId: string | null;
  confidence: number;
  rationale: string;
  suggestedAction: SuggestedAction;
  source: ClassificationSource;
  matchedSignals: string[];
};

// ---------------------------------------------------------------------------
// Cases & Feedback
// ---------------------------------------------------------------------------

export type CaseFeedback = 'correct' | 'false_positive' | 'missed_violation';

export type CaseAction =
  | 'none'
  | 'logged'
  | 'flagged'
  | 'filtered'
  | 'filter_unavailable'
  | 'automod_filtered'
  | 'skipped_automod'
  | 'error';

export type CaseRecord = {
  id: string;
  postId: string;
  postTitle: string;
  postPermalink?: string | undefined;
  subredditName: string;
  createdAt: string;
  updatedAt: string;
  result: ClassificationResult;
  action: CaseAction;
  feedback?: CaseFeedback | undefined;
  actionError?: string | undefined;
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardTab = 'cases' | 'rule-studio';

export type DashboardStats = {
  totalCases: number;
  falsePositiveRate: number;
  topRules: Array<{
    ruleId: string;
    title: string;
    count: number;
  }>;
  actionCounts: Record<CaseAction, number>;
};

export type DashboardPayload = {
  cases: CaseRecord[];
  rules: RuleConfig[];
  stats: DashboardStats;
  settings: RulePilotSettings;
};

export type RulePilotSettings = {
  scanMode: 'monitor' | 'flag' | 'filter';
  llmEnabled: boolean;
  openAiModel: string;
  confidenceThreshold: number;
  timezone: string;
  enabledRuleIds: string[];
};

// ---------------------------------------------------------------------------
// Post Input
// ---------------------------------------------------------------------------

export type PostType = 'text' | 'link' | 'media' | 'poll' | 'crosspost';

export type PostInput = {
  id: string;
  title: string;
  body?: string | undefined;
  url?: string | undefined;
  flairText?: string | undefined;
  subredditName: string;
  createdAt?: Date | undefined;
  permalink?: string | undefined;
  postType?: PostType | undefined;
};

/** Helper to filter out undefined values from a partial when constructing a full object. */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// Rule Builder
// ---------------------------------------------------------------------------

export type RuleBuilderMode = 'natural_language' | 'template' | 'subreddit_rule';

export type RuleBuilderTemplateId = 'sunday_memes' | 'resume_megathread' | 'survey_approval';

export type SubredditRuleInput = {
  title: string;
  description: string;
  kind?: 'all' | 'link' | 'comment' | undefined;
  violationReason?: string | undefined;
};

export type RuleBuilderRequest = {
  mode: RuleBuilderMode;
  intent?: string | undefined;
  templateId?: RuleBuilderTemplateId | undefined;
  subredditRule?: SubredditRuleInput | undefined;
  timezone: string;
  currentRules: Array<Pick<RuleConfigV2, 'id' | 'title' | 'description'>>;
};

export type RuleBuilderResponse =
  | {
      status: 'needs_clarification';
      questions: string[];
    }
  | {
      status: 'draft';
      rule: RuleConfigV2;
    };
