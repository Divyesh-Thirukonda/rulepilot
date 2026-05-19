import type { RuleAction, SuggestedAction } from './types';

export type RoutingActionDefinition = {
  id: RuleAction;
  label: string;
  description: string;
  suggestedAction: SuggestedAction;
  statusClass: 'none' | 'logged' | 'flagged' | 'filtered';
};

export const ROUTING_ACTIONS: RoutingActionDefinition[] = [
  {
    id: 'allow',
    label: 'No action',
    description: 'Do not create a moderation action for matching posts.',
    suggestedAction: 'allow',
    statusClass: 'none',
  },
  {
    id: 'log',
    label: 'Log only',
    description: 'Record the case for moderator review without reporting or filtering.',
    suggestedAction: 'log',
    statusClass: 'logged',
  },
  {
    id: 'flag',
    label: 'Flag/report for review',
    description: 'Report the post so moderators can review it.',
    suggestedAction: 'flag_for_review',
    statusClass: 'flagged',
  },
  {
    id: 'filter',
    label: 'Filter to mod queue',
    description: 'Send the post to the mod queue for review.',
    suggestedAction: 'filter_to_modqueue',
    statusClass: 'filtered',
  },
];

export function routingActionDefinition(action: RuleAction): RoutingActionDefinition {
  return ROUTING_ACTIONS.find((candidate) => candidate.id === action) ?? ROUTING_ACTIONS[1]!;
}

export function routingActionLabel(action: RuleAction): string {
  return routingActionDefinition(action).label;
}

export function routingActionStatusClass(action: RuleAction): RoutingActionDefinition['statusClass'] {
  return routingActionDefinition(action).statusClass;
}

export function suggestedActionForRoutingAction(action: RuleAction): SuggestedAction {
  return routingActionDefinition(action).suggestedAction;
}
