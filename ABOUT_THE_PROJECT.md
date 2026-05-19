# About the Project

## Inspiration

I have an app on my phone called Routines, which allows you to create custom routines for your phone based on various triggers and actions. For example, when I get in my car (trigger), my phone will automatically turn on my mobile hotspot (action).

This got me thinking, what if we could create a similar system for moderators on Reddit? Moderators often deal with rules that are easy for humans to understand but hard to express with regex. In r/csMajors, for example, posts about resumes, career-only advice, laptop recommendations, college comparisons, surveys, hiring, referrals, live online assessments, and weekday memes all need different handling. Some should be reviewed, some should be routed to a megathread, and some should be sent to a more relevant community.

RulePilot started from that problem: give moderators a practical way to enforce nuanced community rules without asking them to hardcode every edge case.

## What it does

RulePilot is a human-in-the-loop moderation assistant for subreddits with rules that are too nuanced for AutoModerator regex alone.

It scans new posts, explains likely rule matches, and gives moderators a dashboard for reviewing cases, tracking false positives, and improving rules over time. It ships with an r/csMajors starter pack, but moderators can also create their own rules in Rule Studio.

RulePilot also includes an AI Builder that helps moderators draft new rules from natural language, one-click templates, or existing subreddit rules. Generated rules are saved as disabled drafts so mods can review, test, edit, and enable them when ready. For broader demos, it includes a generic education-community starter pack for r/EngineeringStudents-style communities.

For violations that are fixable, RulePilot can show moderators repair guidance and open a fixed-post draft link. The draft includes the original post link and instructions for what to change, but it does not automatically message users, schedule reposts, or store the full original post body.

## How we built it

We built RulePilot as a Devvit app with a server-side moderation pipeline, Redis-backed audit records, moderator menu actions, and a custom post dashboard.

The classifier combines deterministic checks for obvious cases with optional OpenAI structured-output classification for ambiguous rule matches. Rules are stored per subreddit as editable `RuleConfigV2` objects, with conditions for keywords, regex, flair, post type, URL domains, title/body length, day of week, time windows, and semantic categories.

On the moderator side, the dashboard shows recent cases, confidence, matched rules, actions, feedback, redirect guidance, and current rule configuration. Rule Studio lets mods create, edit, disable, import, export, simulate, and AI-draft rules.

## Challenges we ran into

The hardest part was keeping the tool powerful without making it too aggressive. Moderation workflows need trust, so RulePilot had to explain its reasoning, stay auditable, and let moderators make the final call.

Another challenge was designing rules that work beyond one subreddit. r/csMajors gave us a concrete starting point, but the app needed to become a reusable system where mods can define their own rules and routing guidance.

We also had to be careful with AI boundaries. RulePilot avoids author history, cross-subreddit behavior, private profile data, and claims like reliable AI-generated-text detection. The AI is used for rule triage and rule drafting, not user profiling.

## Accomplishments that we're proud of

We built a launch-ready moderation console with case review, rule editing, false-positive feedback, redirect guidance, and AI-assisted rule creation.

We made the r/csMajors use case concrete while still keeping the app reusable for other communities. Mods can install the starter pack, customize it, or generate their own disabled draft rules from their community’s written rules.

We also designed RulePilot to work with Reddit’s existing moderation stack. AutoModerator can continue handling deterministic rules, while RulePilot focuses on nuanced cases that benefit from explanation and moderator judgment.

## What we learned

The biggest lesson was that moderation tools need to be designed around workflow, not just classification. A correct prediction is only useful if moderators can understand it, review it quickly, and adjust the system when it gets something wrong.

We also learned that “AI for moderation” works best when it is narrow, transparent, and configurable. RulePilot became stronger when we treated AI as one part of a larger rule system instead of the whole product.

## What's next for RulePilot

Next, we want to complete live playtesting, collect moderator feedback, and tune the r/csMajors starter pack against real examples.

After that, we want to add more reusable rule packs for education and career communities, improve the AI Builder with better clarification flows, and expand the dashboard with filters, sorting, and trend views.

Longer term, RulePilot could become a shared rule-building layer for moderators: a place to turn community guidelines into testable, explainable, and reusable moderation workflows.
