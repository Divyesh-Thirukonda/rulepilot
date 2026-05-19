import type { RedirectTargetType, RuleConfigV2 } from './types';

export type ResolvedRedirect = {
  targetType: RedirectTargetType;
  target: string;
  template: string;
  legacy: boolean;
};

const SUBREDDIT_RE = /^\/?r\/([A-Za-z0-9_]{2,21})$|^([A-Za-z0-9_]{2,21})$/;

export function subredditNameFromTarget(target: string): string | undefined {
  const match = target.trim().match(SUBREDDIT_RE);
  return match?.[1] ?? match?.[2];
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isValidRedirectTarget(targetType: RedirectTargetType, target: string): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  switch (targetType) {
    case 'subreddit':
      return subredditNameFromTarget(trimmed) !== undefined;
    case 'url':
      return isHttpUrl(trimmed);
    case 'megathread':
    case 'custom':
      return true;
  }
}

export function redirectForRule(rule: RuleConfigV2 | undefined): ResolvedRedirect | undefined {
  if (!rule) return undefined;
  const targetType = rule.redirectTargetType;
  const target = rule.redirectTarget?.trim();
  const template = rule.redirectTemplate?.trim();
  if (targetType && target && template && isValidRedirectTarget(targetType, target)) {
    return { targetType, target, template, legacy: false };
  }
  const legacy = rule.redirect?.trim();
  if (legacy) {
    return {
      targetType: 'custom',
      target: 'Legacy guidance',
      template: legacy,
      legacy: true,
    };
  }
  return undefined;
}

export function redirectTargetUrl(redirect: ResolvedRedirect): string | undefined {
  if (redirect.targetType === 'subreddit') {
    const subreddit = subredditNameFromTarget(redirect.target);
    return subreddit ? `https://www.reddit.com/r/${subreddit}/` : undefined;
  }
  if ((redirect.targetType === 'url' || redirect.targetType === 'megathread') && isHttpUrl(redirect.target)) {
    return redirect.target;
  }
  return undefined;
}

export function createSubredditDraftUrl(options: {
  redirect: ResolvedRedirect;
  postTitle: string;
  postPermalink?: string | undefined;
}): string | undefined {
  if (options.redirect.targetType !== 'subreddit') return undefined;
  const subreddit = subredditNameFromTarget(options.redirect.target);
  if (!subreddit) return undefined;
  const body = [
    'RulePilot suggested repost draft.',
    options.postPermalink ? `Original post: ${new URL(options.postPermalink, 'https://www.reddit.com').toString()}` : undefined,
    '',
    options.redirect.template,
  ].filter((part) => part !== undefined).join('\n');
  const params = new URLSearchParams({
    title: options.postTitle,
    text: body,
  });
  return `https://www.reddit.com/r/${subreddit}/submit?${params.toString()}`;
}
