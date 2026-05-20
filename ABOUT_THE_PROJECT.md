# About the Project

## Inspiration

I opened Reddit and a few posts on r/csmajors had shown up. One of them was clearly a spam post trying to market his own app, which was against the rules of the subreddit. Granted it was taken down by a moderator, but not before 3 people had commented "spam" on it. If only AutoModerator could have caught it.

Moderators often deal with rules that are easy for humans to understand but hard to express with regex. In r/csMajors, for example, posts about Amazon get routed to a megathread, posts about live online assessments are not allowed, and posts about programming humor should be sent to a different subreddit. In some communities, weekday memes are ONLY allowed on Sundays. These rules all need different handling, far too complex for a moderator to code out from scratch using reddit's limited auto mod features.

RulePilot started to solve this problem. Give mods a practical way to enforce community rules.

### Metaphor

I have an app on my phone called Routines, which allows you to create custom routines for your phone based on various triggers and actions. For example, when I get in my car (trigger), my phone will automatically turn on my mobile hotspot (action). This got me thinking, what if we could create a similar system for mods on Reddit?

## What it does

RulePilot scans new posts, explains likely rule matches, and gives mods a dashboard for reviewing cases. It ships with an r/csMajors starter pack, but mods can also create and import their own rules in Rule Studio.

RulePilot also includes an AI Builder that helps mods draft new rules from natural language or existing subreddit rules. Generated rules are saved as disabled drafts so mods can review, test, edit, and enable them when ready. The builder is designed for common moderator requests like spam, AI slop, low-effort posts, rude engagement, surveys, hiring/referrals, resume megathreads, homework boundaries, live interview/OA content, off-topic posts, buying advice, restricted recurring topics, formatting rules, and project showcases.

For violations that are fixable, RulePilot can show mods repair guidance and open a fixed-post draft link. The draft includes the original post link and instructions for what to change, but it does not automatically message users, schedule reposts, or store the full original post body.

The goal is not to make moderation fully automatic. RulePilot turns fuzzy community guidelines into reviewable rules, shows why a post matched, and gives moderators a safer way to tune the system through examples, thresholds, simulator checks, and feedback.

## How we built it

We built RulePilot as a Devvit app with a server-side moderation pipeline, Redis-backed audit records, moderator menu actions, and a custom post dashboard. I built a TODO list with features I wanted to accomplish, and had Codex help me with the development and debugging processes.

The classifier combines deterministic checks for obvious cases with optional OpenAI structured-output classification for ambiguous rule matches. Rules are stored per subreddit as editable `RuleConfigV2` objects, with conditions for keywords, regex, flair, post type, URL domains, title/body length, day of week, time windows, and semantic rubrics.

On the moderator side, the dashboard shows recent cases, confidence, matched rules, actions, feedback, redirect guidance, and current rule configuration. Rule Studio lets mods create, edit, disable, import, export, simulate, and AI-draft rules, with clear separation between rule conditions and the actions RulePilot should take.

## Challenges we ran into

The hardest part was keeping the tool powerful without making it too aggressive. Moderation workflows need trust, so RulePilot had to explain its reasoning and let moderators make the final call on everything.

Another challenge was designing rules that work beyond one subreddit. r/csMajors gave us a concrete starting point, but the app needed to become a reusable system where mods can define their own rules and routing guidance.

Finally, and probably the most important part, was integrating well with existing mod tools rather than building something with duplicate functionality. Reddit has some really solid mod tools, and it would be a shame to completely replace them with our own. Instead, we wanted to create something that would work well with the existing mod tools and provide additional value to moderators, as a helpful add on, not something that would completely replace what mods already use.

## Accomplishments that we're proud of

We built a launch-ready moderation console with case review, rule editing, false-positive feedback, redirect guidance, and AI-assisted rule creation.

We made the r/csMajors use case concrete while still keeping the app reusable for other communities. Mods can install the starter pack, customize it, or generate their own disabled draft rules from natural-language intent or their community’s written rules.

We also designed RulePilot to work with Reddit’s existing moderation stack. AutoModerator can continue handling deterministic rules, while RulePilot focuses on nuanced cases that benefit from explanation and moderator judgment.

## What we learned

The biggest lesson was that moderation tools need to be designed around workflow, not just classification. A correct prediction is only useful if moderators can understand it, review it quickly, and adjust the system when it gets something wrong.

We also learned that “AI for moderation” works best when it is narrow, transparent, and configurable. RulePilot became stronger when we treated AI as one part of a larger rule system instead of the whole product.

## What's next for RulePilot

Next, we want to complete live playtesting, collect moderator feedback, and tune the LLM prompts for the r/csMajors starter pack against more posts.

After that, we want to add more reusable rule packs for education and career communities, improve the AI Builder with better clarification flows, and expand the dashboard with filters, sorting, and trend views.

RulePilot could become a shared rule-building layer for moderators: a place to turn community guidelines into a testable playground for experimentation and reusable moderation workflows.
