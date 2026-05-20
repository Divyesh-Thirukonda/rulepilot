import { describe, expect, it } from 'vitest';

import { CS_MAJORS_PRESET } from '../shared/rules';
import { classifyWithOpenAI } from './openai';

const describeLive = process.env.RULEPILOT_RUN_LIVE_OPENAI === '1' ? describe : describe.skip;

describeLive('RulePilot classification live OpenAI smoke', () => {
  it('returns structured evidence and action fields for a high-signal meme post', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Set OPENAI_API_KEY before running npm run test:classification:live.');
    }

    const result = await classifyWithOpenAI({
      post: {
        id: 't3_live_meme',
        title: 'POV: your OS professor says the project is easy',
        body: '',
        flairText: 'Meme',
        subredditName: 'csMajors',
        postType: 'text',
        createdAt: new Date('2026-05-18T17:00:00.000Z'),
      },
      rules: CS_MAJORS_PRESET,
      apiKey,
      model: process.env.RULEPILOT_OPENAI_MODEL ?? 'gpt-5-nano',
      timezone: 'America/Chicago',
    });

    expect(result.source).toBe('llm');
    expect(result.ruleId).toBe('shitposts-and-memes');
    expect(['needs_review', 'violation']).toContain(result.decision);
    expect(result.evidence?.length).toBeGreaterThan(0);
    expect(result.actionReason?.length).toBeGreaterThan(0);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  }, 120_000);
});
