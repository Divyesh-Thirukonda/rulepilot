import { settings } from '@devvit/web/server';

import { DEFAULT_ENABLED_RULE_IDS } from '../shared/rules';
import type { RulePilotSettings } from '../shared/types';

const DEFAULT_SETTINGS: RulePilotSettings = {
  scanMode: 'filter',
  llmEnabled: true,
  openAiModel: 'gpt-5-nano',
  confidenceThreshold: 0.76,
  timezone: 'America/Chicago',
  enabledRuleIds: DEFAULT_ENABLED_RULE_IDS,
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(0.99, Math.max(0.01, value));
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') && value.length > 0 ? value : fallback;
}

export async function getRulePilotSettings(): Promise<RulePilotSettings> {
  const values = await settings.getAll<Record<string, unknown>>();
  const scanModeValue = asString(values['scan-mode'], DEFAULT_SETTINGS.scanMode);
  const scanMode: RulePilotSettings['scanMode'] =
    scanModeValue === 'monitor' || scanModeValue === 'flag' || scanModeValue === 'filter' ? scanModeValue : DEFAULT_SETTINGS.scanMode;

  return {
    scanMode,
    llmEnabled: asBoolean(values['llm-enabled'], DEFAULT_SETTINGS.llmEnabled),
    openAiModel: asString(values['openai-model'], DEFAULT_SETTINGS.openAiModel),
    confidenceThreshold: asNumber(values['confidence-threshold'], DEFAULT_SETTINGS.confidenceThreshold),
    timezone: asString(values.timezone, DEFAULT_SETTINGS.timezone),
    enabledRuleIds: asStringArray(values['enabled-rule-ids'], DEFAULT_SETTINGS.enabledRuleIds),
  };
}

export async function getOpenAiApiKey(): Promise<string | undefined> {
  const key = await settings.get<string>('openai-api-key');
  return key?.trim() || undefined;
}
