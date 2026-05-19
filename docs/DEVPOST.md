# RulePilot Hackathon Submission Draft

## App Listing

Pending developer.reddit.com app listing after `devvit upload` and review.

## Tool Overview

RulePilot is a Devvit moderation app that helps moderators enforce nuanced natural-language rules that are hard to encode in AutoModerator regex. It scans new posts, runs deterministic checks for obvious rule matches, optionally calls OpenAI structured outputs for ambiguous cases, and stores an audit record with the matched rule, confidence, rationale, action, and moderator feedback.

The app ships with an r/csMajors preset covering out-of-scope posts, memes, surveys/hiring/referrals, resume sticky routing, live OA question discussion, spam, low-quality posts, common questions, AI/LLM policy, college comparisons, laptop posts, restricted topics, and personal projects. It also includes a generic education-community starter pack for r/EngineeringStudents-style communities.

Moderators can configure scan mode, enabled rules, confidence threshold, timezone, LLM usage, and model. They can manually scan a post, mark a RulePilot result correct, mark false positives, and create a dashboard post with recent cases and aggregate stats. Rule Studio lets mods create, edit, disable, import, export, simulate, and AI-draft rules from natural language, one-click templates, or existing subreddit rules. For fixable violations, RulePilot can show repair guidance and open a mod-facing fixed-post draft link without sending automated DMs or storing full post bodies.

RulePilot is designed to complement Reddit's existing moderation and safety systems. It is event-driven on new post submissions, AutoModerator filter events, and explicit moderator scans; it does not crawl historical content, run recurring scans, ban users, permanently remove content, DM users, or inspect author history. AutoModerator remains the right place for deterministic regex and known-pattern rules. RulePilot focuses on nuanced triage, explainable review routing, disabled AI-generated drafts, and mod-facing redirect guidance.

## Project Impact

Potential communities:

- r/csMajors: reduces repeated manual handling of resume reviews, laptop posts, college comparisons, live OA questions, restricted-topic posts, and weekday memes.
- r/cscareerquestions: can adapt the same natural-language triage pattern for repetitive career questions, resume routing, referral/hiring posts, and low-effort job-market posts.
- r/EngineeringStudents: can start from the education-community pack for homework boundaries, survey approvals, memes, school comparisons, resume/career threads, buying advice, low-effort questions, and self-promotion.

Impact:

- saves moderator time by pre-routing high-confidence posts to review with an explanation;
- makes rule enforcement easier to audit because every action has a matched rule, confidence, rationale, and feedback state;
- gives mods a measurable false-positive loop instead of opaque regex-only filtering.
- keeps existing moderation workflows intact by adding explainable triage rather than replacing Reddit's mod queue, AutoModerator, or safety enforcement.
- helps more communities adopt the tool because mods can generate their own disabled draft rules instead of waiting for the app developer to hardcode community-specific logic.

## Ported Project Fields

Not applicable. RulePilot is submitted as a new mod tool, not a Data API bot port.

## Port Completion

Not applicable.

## Developer Platform Feedback

Devvit's new `Post.filter()` capability is a strong fit for human-in-the-loop moderation tools. Two improvements would make this category easier to build:

- expose a first-class moderator-only dashboard surface so app dashboards do not need to be custom posts guarded by server-side checks;
- document LLM app review examples, especially how to phrase privacy disclosures and what minimum information reviewers expect for approved OpenAI/Gemini use.
