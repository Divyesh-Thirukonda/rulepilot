# RulePilot

RulePilot is a Devvit moderation app that turns nuanced subreddit guidelines into editable, testable post-triage rules.

It is built for communities whose rules are easy for humans to understand but hard to express as simple AutoModerator regex. r/csMajors is the demo community: the app starts with rules for out-of-scope posts, respectful engagement, shitposts and memes, live online-assessment/interview questions, and lazy or low-quality posts. Mods can keep that starter pack, import their own written subreddit rules, or build rules from scratch.

## What It Does

RulePilot has two main moderator surfaces:

- **Cases**: shows recent RulePilot scans, matched rules, actions, explanations, and moderator feedback.
- **Rule Studio**: lets moderators create, edit, enable, disable, import, export, simulate, and save subreddit-specific rules.

Rules are split into conditions and actions. Conditions can include positive and negative examples, keywords, regex, post type, flair text, URL domain, title/body length, day of week, time window, and a semantic rubric for ambiguous moderation concepts. Actions are deliberately review-oriented: no action, log only, flag/report for review, or filter to mod queue.

Rule Studio also includes RulePilot Builder. Mods can leave the prompt blank to start with an empty rule template, describe a rule in natural language, or import current subreddit rules. OpenAI structured output is used only for the drafting/classification paths that need it, and generated rules are saved as disabled drafts until a moderator reviews, edits, tests, and enables them.

For fixable violations, RulePilot can show repair guidance and open a same-subreddit draft link. It does not DM users, schedule reposts, copy full post bodies into drafts, ban users, or permanently remove content.

## Why It Exists

Moderators often have policies like:

- memes are only allowed on Sundays;
- live online-assessment questions are not allowed, but practice questions are okay;
- low-effort posts need more context;
- career-only questions belong in a different community;
- resume posts belong in a megathread;
- some recurring topics need moderator approval first.

These rules usually require context, exceptions, and moderator judgment. RulePilot gives mod teams a way to turn those guidelines into reviewable rules with examples, thresholds, simulation, explanations, and feedback.

## r/csMajors Starter Pack

The built-in starter pack is intentionally small for the hackathon demo:

- Out of scope
- Respectful engagement
- Shitposts and memes
- Live online-assessment and interview questions
- Lazy or low-quality posts

Moderators can also use **Import subreddit rules** to draft disabled rules from the current subreddit rule list. Existing custom rules are not overwritten.

## Working With Reddit Mod Tools

RulePilot is meant to layer with Reddit's existing moderation stack:

- Reddit safety tooling remains authoritative.
- AutoModerator should continue handling deterministic regex, domain, flair, and known-pattern rules.
- RulePilot focuses on nuanced post triage, explainable review routing, rule drafting, and feedback.
- The native mod queue remains the decision surface for filtered posts.
- When AutoModerator filters a post first, RulePilot records that AutoModerator acted and does not run another classification/action pipeline for that event.

RulePilot is event-driven. It responds to new post submissions, AutoModerator filter events, post deletion events, and explicit moderator menu scans. It does not run hourly scanners, crawl historical posts, inspect author history, scan other subreddits, or profile users.

## Moderator Workflow

1. Install RulePilot and configure scan mode, OpenAI usage, confidence threshold, timezone, and enabled preset rules.
2. Use the subreddit menu action to create the RulePilot moderator dashboard.
3. Open Rule Studio and either import subreddit rules, create a blank rule, or draft a rule from natural language.
4. Review the disabled draft, edit its conditions/actions, and run the simulator against sample posts.
5. Enable the rule when it is ready.
6. Review cases as new posts are scanned, then mark results correct or false positive from the dashboard or post menu.

## Menu Actions

RulePilot adds moderator-only menu actions:

- `Scan with RulePilot`
- `RulePilot: mark correct`
- `RulePilot: false positive`
- `Create RulePilot dashboard`

## Architecture

- **Platform**: Reddit Developer Platform / Devvit
- **Frontend**: React + TypeScript + Vite custom post webview
- **Server**: Devvit server endpoints and triggers
- **Storage**: Devvit Redis audit records
- **AI**: OpenAI structured outputs for ambiguous classification and rule drafting
- **Tests**: Vitest unit tests plus optional live OpenAI smoke tests

Key Devvit capabilities:

- `onPostSubmit`
- `onPostDelete`
- `onAutomoderatorFilterPost`
- moderator-only post and subreddit menu actions
- Redis
- Reddit API moderator permissions
- HTTP allowlist for `api.openai.com`

## Data And Privacy

RulePilot stores bounded audit records for moderator review: post id, title excerpt, permalink, matched rule, confidence, rationale, action, timestamp, and feedback state. Redis records expire after 30 days, and post deletion events remove matching audit records.

When OpenAI is enabled, RulePilot sends only the minimum context needed for the task: post title/body excerpt, flair, URL/domain, post kind, local datetime features, enabled rule text, or moderator-provided rule text. It does not send author history, private profile data, cross-subreddit behavior, voting history, saved content, recently viewed content, or mod-only notes.

RulePilot does not claim reliable AI-authorship detection. AI/LLM policy rules classify the policy topic, not whether text was written by AI.

See [PRIVACY.md](./PRIVACY.md) and [TERMS.md](./TERMS.md).

## Developer Setup

```sh
npm install
npm run type-check
npm run test
npm run build
```

Devvit commands:

```sh
npm run login
npm run dev
npm run deploy
npm run launch
```

`npm run deploy` runs type-checks, tests, and `devvit upload`.

Set the OpenAI secret before using live classification or RulePilot Builder:

```sh
npx devvit settings set openai-api-key
```

Optional live OpenAI smoke tests:

```sh
npm run test:ai-builder:live
npm run test:classification:live
```

## App Listing Copy

Short description:

> RulePilot helps moderators turn nuanced subreddit rules into editable, testable post-triage workflows.

Long description:

> RulePilot is a Devvit moderation app for communities whose rules are difficult to encode with simple regex. Moderators can import written subreddit rules, draft new rules from natural language, simulate rule conditions against sample posts, and review recent cases in a dashboard. RulePilot works with the existing Reddit mod queue and AutoModerator by logging, reporting, or filtering posts for review instead of replacing native moderation workflows.

## Built With

TypeScript, React, Vite, Devvit, Reddit Developer Platform, Reddit API, Redis, OpenAI API, Vitest, Node.js, npm, and GitHub.
