# RulePilot Hackathon Submission Draft

## App Listing

App URL: https://developers.reddit.com/apps/rulepilot

Short description:

> RulePilot helps moderators turn nuanced subreddit rules into editable, testable post-triage workflows.

Developer Portal / Devpost description:

> RulePilot is a Devvit moderation app for communities whose rules are difficult to encode with simple regex. Moderators can import written subreddit rules, draft new rules from natural language, simulate rule conditions against sample posts, and review recent cases in a dashboard. RulePilot works with the existing Reddit mod queue and AutoModerator by logging, reporting, or filtering posts for review instead of replacing native moderation workflows.

## Tool Overview

RulePilot is a new Devvit moderation tool that turns community guidelines into reviewable post-triage rules. It is built around two moderator tabs: Cases and Rule Studio.

Cases shows recent scans, matched rules, actions, explanations, and moderator feedback. Rule Studio lets moderators create, edit, enable, disable, import, export, simulate, and save subreddit-specific rules. Rules are split into conditions and actions: conditions can include examples, keywords, regex, post type, flair text, URL domain, title/body length, day of week, time windows, and semantic rubrics; actions are no action, log only, flag/report for review, or filter to mod queue.

RulePilot Builder helps mods create disabled draft rules. Mods can leave the prompt blank to start from an empty template, describe a rule in natural language, or import current subreddit rules. OpenAI structured output is used for rule drafting and ambiguous classification when enabled. Drafted rules stay disabled until a moderator reviews, edits, simulates, and enables them.

The app ships with a focused r/csMajors starter pack covering out-of-scope posts, respectful engagement, shitposts and memes, live online-assessment/interview questions, and lazy or low-quality posts. It can also import the current subreddit rule list and draft disabled rules from those written policies without overwriting existing custom rules.

RulePilot is designed to complement Reddit's existing moderation and safety systems. It is event-driven on new post submissions, AutoModerator filter events, post deletion events, and explicit moderator scans. It does not crawl historical content, run recurring scans, ban users, permanently remove content, DM users, inspect author history, schedule reposts, or copy full post bodies into drafts.

## Project Impact

Potential communities:

- r/csMajors: reduces repeated manual handling of out-of-scope posts, live OA questions, weekday memes, rude posts, and low-effort questions.
- r/cscareerquestions: can adapt the same rule-building and triage pattern for repetitive career questions, resume routing, referral/hiring posts, and low-effort job-market posts.
- r/EngineeringStudents: can adapt Rule Studio and RulePilot Builder for homework boundaries, survey approvals, memes, school comparisons, resume/career threads, buying advice, low-effort questions, and self-promotion.

Impact:

- saves moderator time by routing likely violations to review with an explanation;
- makes rule enforcement easier to audit because every case has a matched rule, confidence, rationale, action, and feedback state;
- gives mods a false-positive feedback loop instead of opaque regex-only filtering;
- keeps existing moderation workflows intact by adding explainable triage rather than replacing Reddit's mod queue, AutoModerator, or safety enforcement;
- helps more communities adopt the tool because mods can generate their own disabled draft rules instead of waiting for the app developer to hardcode community-specific logic.

## Ported Project Fields

Not applicable. RulePilot is submitted as a new mod tool, not a Data API bot port.

## Port Completion

Not applicable.

## Developer Platform Feedback

Devvit's `Post.filter()` capability is a strong fit for human-in-the-loop moderation tools. Two improvements would make this category easier to build:

- expose a first-class moderator-only dashboard surface so app dashboards do not need to be custom posts guarded by server-side checks;
- document LLM app review examples, especially how to phrase privacy disclosures and what minimum information reviewers expect for approved OpenAI/Gemini use.
