import type { OnPostSubmitRequest, PostV2 } from '@devvit/web/shared';
import type { Post } from '@devvit/web/server';

import type { PostInput, PostType } from '../shared/types';

export function ensurePostId(id: string): string {
  return id.startsWith('t3_') ? id : `t3_${id}`;
}

function inferPostType(post: { url?: string | undefined; selftext?: string | undefined; body?: string | undefined; is_gallery?: boolean | undefined; poll_data?: unknown; crosspost_parent?: string | undefined }): PostType | undefined {
  // Gallery or media posts
  if (post.is_gallery) {
    return 'media';
  }
  // Poll posts
  if (post.poll_data) {
    return 'poll';
  }
  // Crosspost
  if (post.crosspost_parent) {
    return 'crosspost';
  }
  // URL-based detection
  if (post.url) {
    // Media URLs (images, video)
    if (/\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)$/i.test(post.url) ||
        /\b(i\.redd\.it|v\.redd\.it|imgur\.com|i\.imgur\.com|preview\.redd\.it)\b/.test(post.url)) {
      return 'media';
    }
    // Self-post URLs contain /comments/
    if (!post.url.includes('/comments/')) {
      return 'link';
    }
  }
  // If it has body text, it's a text post
  if (post.selftext || post.body) {
    return 'text';
  }
  return undefined;
}

export function postInputFromTrigger(input: OnPostSubmitRequest): PostInput | undefined {
  if (!input.post || !input.subreddit) {
    return undefined;
  }
  return postInputFromPostV2(input.post, input.subreddit.name);
}

export function postInputFromPostV2(post: PostV2, subredditName: string): PostInput {
  return {
    id: ensurePostId(post.id),
    title: post.title,
    body: post.selftext,
    url: post.url,
    flairText: post.linkFlair?.text,
    subredditName,
    createdAt: post.createdAt ? new Date(post.createdAt * 1000) : undefined,
    permalink: post.permalink,
    postType: inferPostType(post),
  };
}

export function postInputFromPost(post: Post): PostInput {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    url: post.url,
    flairText: post.flair?.text,
    subredditName: post.subredditName,
    createdAt: post.createdAt,
    permalink: post.permalink,
    postType: inferPostType(post),
  };
}
