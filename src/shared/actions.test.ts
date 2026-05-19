import { describe, expect, it } from 'vitest';

import { ROUTING_ACTIONS, suggestedActionForRoutingAction } from './actions';

describe('routing actions', () => {
  it('defines the MVP moderator routing actions', () => {
    expect(ROUTING_ACTIONS.map((action) => action.id)).toEqual(['allow', 'log', 'flag', 'filter']);
    expect(ROUTING_ACTIONS.map((action) => action.label)).toEqual([
      'No action',
      'Log only',
      'Flag/report for review',
      'Filter to mod queue',
    ]);
  });

  it('maps rule actions to classifier suggested actions', () => {
    expect(suggestedActionForRoutingAction('allow')).toBe('allow');
    expect(suggestedActionForRoutingAction('log')).toBe('log');
    expect(suggestedActionForRoutingAction('flag')).toBe('flag_for_review');
    expect(suggestedActionForRoutingAction('filter')).toBe('filter_to_modqueue');
  });
});
