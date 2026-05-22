# About the Project

## Inspiration

I opened Reddit and a few posts on r/csmajors had shown up. One of them was clearly a spam post trying to market his own app, which was against the rules of the subreddit. Granted it was taken down by a moderator, but not before 3 people had commented "spam" on it. If only AutoModerator could have caught it.

Moderators often deal with rules that are easy for humans to understand but hard to express with regex. In r/csMajors, for example, posts about Amazon get routed to a megathread, posts about live online assessments are not allowed, and posts about programming humor should be sent to a different subreddit. In some communities, weekday memes are ONLY allowed on Sundays. These rules all need different handling, which is usually far too complex for reddit's limited auto mod features.

RulePilot started to solve this problem. Give mods a practical way to enforce community rules.

### Metaphor

I have an app on my phone called Routines, which allows you to create custom routines for your phone based on various triggers and actions. For example, when I get in my car (trigger), my phone will automatically turn on my mobile hotspot (action). This got me thinking, what if we could create a similar system for mods on Reddit?

## What it does

RulePilot is split into 2 tabs. The main attraction is the Rule Studio, where mods can build or import their subreddit's community guidelines. If they choose to build it, they can use AI to pre-populate some of the fields (not necessary though). The rules can become complicated, but we split it up into conditions and actions. The conditions include positive and negative examples, boolean logic conditions (includes regex, day of week, URL domain, and even a semantic AI detection), and a threshold. We also allow mods to simulate whether a post would be detected by current rule's conditions they've set up so far. On the actions side, we have routing actions (mod queue, flag it, or just log it), redirect the post to a megathread or another subreddit, or fix the post for the user so it does not violate the rule. These rules can be disabled, enabled, tested, and edited at any time.

The other tab lets you view the cases. As users post, mods can see each case and review how RulePilot handled it. The AI explains likely rule matches. It comes with an r/csMajors starter pack, but mods can also create and import their own rules in Rule Studio.

The builder is designed for common moderator requests like spam, AI slop, low-effort posts, rude engagement, surveys, hiring/referrals, resume megathreads, homework boundaries, live interview/OA content, off-topic posts, buying advice, restricted recurring topics, formatting rules, and project showcases. The goal is not to make moderation fully automatic. RulePilot turns community guidelines into rules (detected with various boolean logic) and gives moderators a safer way to tune the system through examples, thresholds, simulator checks, and feedback.

## How we built it

We built RulePilot as a Devvit app with a server-side moderation pipeline, Redis-backed audit records, moderator menu actions, and a custom post dashboard. I built a TODO list with features I wanted to accomplish, and had Codex help me with the development and debugging processes.

The classifier combines deterministic checks for obvious cases with optional OpenAI structured-output classification for ambiguous rule matches. Rules are stored per subreddit as editable `RuleConfigV2` objects, with conditions for keywords, regex, flair, post type, URL domains, title/body length, day of week, time windows, and semantic rubrics.

On the moderator side, the dashboard shows recent cases, matched rules, and feedback. Rule Studio lets mods create, edit, disable, import, export, simulate, and AI-draft rules, with clear separation between rule conditions and the actions RulePilot should take. New AI-drafted rules start from a moderator prompt or imported subreddit rule, then return to the full editor for review.

## Challenges

The semantic identifier was tricky, since describing a rule can get complicated (such as AI slop detection). By going through 20 AI generated posts and analysing them, I was able to lock down some common patterns that makes it obvious an LLM was used. Adding this to our rule detector was simple from there. 

Another challenege was integrating well with existing mod tools rather than building something with duplicate functionality. Reddit has some really solid mod tools, like the AI detector for example. I wasn't able to find an easy way to utilize it (since I know it exists in the r/wallstreetbets sub). But we tried our best to create something that would work well with the existing mod tools (the mod queue, for example) and provide additional value to moderators, as a helpful add on, not something that would completely replace what mods already use. 

## Accomplishments

I'm really happy with the way the UX came out, especially how easy it is to adopt the tool, since the 'import from subreddit rules' is just a click away. I think everything feels intuitive and easy to use.

The data flow also feels clean, since the data structure we're passing in to the context has enough data for our AI to understand and respond in another strucutre that let's use scaffold a draft rule.

## What we learned

The biggest lesson was that moderation tools need to be designed around workflow, not just classification. A correct prediction is only useful if moderators can understand, review, and adjust the system when it gets something wrong. We also learned that “AI for moderation” works best when it is for grunt work, and provides the human-in-the-loop an easy way to review the AI output. RulePilot strengths came from treating AI as just a part of a larger rule system.

## What's next for RulePilot

Next, we want to collect moderator feedback, and tune the LLM prompts for the r/csMajors starter pack against more posts. Some false-positive patterns need to be learned incrementally from moderator feedback instead of only through static examples. For example, r/csmajors users traditionally dislike posts about the hiring scene in India, since it is drasitically different from the US. But it's hard to pinpoint that. The best we humans can do is look for keywords like 'placement' or 'B.Tech' which are more popular in non-US job market. Although that's a good starting point, we are still missing many other keywords and phrases and opens the possibility to many FPs.

Once it's a good product, I would like to see the semantic layer / positive and negative examples added to the current automation tool.
