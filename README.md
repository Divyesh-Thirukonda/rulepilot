# RulePilot

RulePilot is a Devvit moderation app for communities whose rules are too nuanced for simple regex. It scans new posts, explains likely rule matches, and routes high-confidence cases to moderator review instead of taking irreversible action.

The app ships with a focused r/csMajors preset covering out-of-scope posts, respectful engagement, weekday memes and shitposts, live OA/interview question discussion, and lazy or low-quality posts.

## What It Does

- Scans new posts with deterministic checks for clear rule matches.
- Uses OpenAI structured outputs for ambiguous rule-routing when enabled.
- Stores an audit trail in Redis with the matched rule, confidence, explanation, action, and mod feedback.
- Helps moderators draft new rules from natural language or existing subreddit rules. AI-generated rules are saved as disabled drafts until a moderator reviews and enables them.
- Provides mod-facing fixed-post draft links for rules that authors can repair, such as adding context, using a megathread, or reposting on an allowed day.
- Records when AutoModerator already filtered a post so RulePilot can stand down and show that status in the dashboard.
- Adds moderator menu actions:
  - `Scan with RulePilot`
  - `RulePilot: mark correct`
  - `RulePilot: false positive`
  - `Create RulePilot dashboard`
- Provides a moderator dashboard with recent cases, top matched rules, action counts, false-positive rate, current settings, Rule Studio, and AI-assisted rule drafting.

## Moderation Behavior

RulePilot is human-in-the-loop by default. In `filter` mode, high-confidence cases are sent to mod review with `Post.filter()`. In `flag` mode, RulePilot reports likely violations for moderator review. In `monitor` mode, it only logs cases.

RulePilot is event-driven: it evaluates new post submissions, AutoModerator filter events, and explicit moderator menu scans. It does not run hourly backfills, crawl community history, replace AutoModerator, or bypass Reddit's native mod queue and safety tooling.

RulePilot does not ban users, inspect author history, scan other subreddits, DM users, schedule reposts, copy full post bodies into drafts, or make claims that it can reliably detect AI-generated text. Redis audit records expire after 30 days, and records for deleted posts are removed when Reddit sends a post deletion event.

## Working With Existing Reddit Mod Tools

RulePilot is meant to layer on top of the tools moderators already use:

- Reddit safety tooling remains authoritative for platform safety enforcement.
- AutoModerator should continue to handle deterministic regex, domain, flair, and known-pattern rules.
- RulePilot focuses on nuanced natural-language triage, explainable review routing, and mod-facing redirect guidance.
- The native mod queue remains the decision surface. RulePilot can log, report, or filter to mod review, but it does not permanently remove content, ban users, DM users, or crawl historical posts.
- When AutoModerator filters a post first, RulePilot records that AutoModerator acted and does not run another classification/action pipeline for that event.

## Installer Settings

- `RulePilot action mode`: `filter`, `flag`, or `monitor`.
- `Use OpenAI for ambiguous posts`: enables or disables LLM classification and AI Builder drafting.
- `OpenAI model`: defaults to `gpt-5-nano`.
- `Global confidence threshold`: default `0.76`.
- `Subreddit timezone`: default `America/Chicago`.
- `Enabled r/csMajors preset rules`: multi-select rule list.

The OpenAI API key is a global secret setting:

```sh
npx devvit settings set openai-api-key
```

## Development

```sh
npm install
npm run type-check
npm run test
npm run build
```

Devvit commands:

```sh
npm run login
npx devvit playtest
npx devvit upload
npx devvit publish
```

If this directory was created manually instead of through `devvit new`, create the app in the Reddit Developer Portal and make sure the app slug is `rulepilot` or set `DEVVIT_APP_NAME` when playtesting/uploading.

## Privacy

When LLM classification or AI Builder drafting is enabled, RulePilot sends only the post title/body excerpt or moderator-provided rule text plus configured rule text to OpenAI. It does not send author history, private profile data, cross-subreddit activity, or mod-only notes.

See [PRIVACY.md](./PRIVACY.md) and [TERMS.md](./TERMS.md).
