# RulePilot

RulePilot is a Devvit moderation app for communities whose rules are too nuanced for simple regex. It scans new posts, explains likely rule matches, and routes high-confidence cases to moderator review instead of taking irreversible action.

The app ships with an r/csMajors preset covering scope, memes, surveys/hiring/referrals, resumes, live OA questions, low-quality posts, common questions, AI/LLM content policy, college comparisons, laptop posts, restricted topics, and personal projects.

## What It Does

- Scans new posts with deterministic checks for clear rule matches.
- Uses OpenAI structured outputs for ambiguous rule-routing when enabled.
- Stores an audit trail in Redis with the matched rule, confidence, explanation, action, and mod feedback.
- Adds moderator menu actions:
  - `Scan with RulePilot`
  - `RulePilot: mark correct`
  - `RulePilot: false positive`
  - `Create RulePilot dashboard`
- Provides a moderator dashboard with recent cases, top matched rules, action counts, false-positive rate, and current settings.

## Moderation Behavior

RulePilot is human-in-the-loop by default. In `filter` mode, high-confidence cases are sent to mod review with `Post.filter()`. In `flag` mode, RulePilot reports likely violations for moderator review. In `monitor` mode, it only logs cases.

RulePilot is event-driven: it evaluates new post submissions and explicit moderator menu scans. It does not run hourly backfills, crawl community history, replace AutoModerator, or bypass Reddit's native mod queue and safety tooling.

RulePilot does not ban users, inspect author history, scan other subreddits, or make claims that it can reliably detect AI-generated text. Redis audit records expire after 30 days, and records for deleted posts are removed when Reddit sends a post deletion event.

## Installer Settings

- `RulePilot action mode`: `filter`, `flag`, or `monitor`.
- `Use OpenAI for ambiguous posts`: enables or disables LLM classification.
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

When LLM classification is enabled, RulePilot sends only the post title, body excerpt, flair text, URL domain, and configured rule text to OpenAI. It does not send author history, private profile data, cross-subreddit activity, or mod-only notes.

See [PRIVACY.md](./PRIVACY.md) and [TERMS.md](./TERMS.md).


## PROMPTS:

### 1. The Hackathon Idea Pitch

ok the goal of this is to do a hackathon.

Here are details

Overview
Reddit is hosting the Mod Tools and Migrated Apps Hackathon from April 29nd to May 27th. We’re offering developers $45,000 in prizes for new tools built to empower moderators, as well as existing mod apps ported from our Data API to Devvit. 

The challenge: create a utility, automation, or moderation tool that solves existing community pain points using Devvit i.e. Reddit’s Developer Platform.

For this hackathon, we have three categories with grand prizes:


New Mod Tool Category: Build a brand-new utility or tool designed to make both leading and moderating communities easier. We want to see time savings, utilities for thoughtful engagement, and tools to delight subreddit moderators across the site. 

Ported Data API App Category: Take a classic Reddit bot (originally built on PRAW or other frameworks) and port it to Devvit. We want to see these essential tools become more stable, faster, and easier for mods to install via the App Directory. We are excited to see individual community tools become generalized for broader mod benefit, as well as bespoke subreddit tools finding a home on Devvit.

Moderators Choice: A panel of moderator judges will select one additional grand prize winner, based on the core judging criteria. This moderator panel will review a shortlist of projects from the two other categories that score highly in the first round of judging.
What to Build
Build a moderation app with Devvit. We are looking for tools that range from automated enforcement, to better queue management, to creative community-building utilities. The best apps reduce moderation load significantly, improve community operation, or serve to incentivize good behavior in the community through innovative utilities.


These apps can have a custom post component, or can operate entirely in the background. We want to see evidence that the tool can save significant time or make a measurable impact. Importantly, the tool should also be easy to understand, install, and provide a great user experience for mods installing the tool.

The Best New Mod Tool: For the most innovative tool or utility that solves a significant pain point for moderators. This could be easier rule enforcement, moderation workflows, community engagement tools, or anything else that supports moderators in community leadership. It should be unique to the Devvit ecosystem and provide a seamless experience for mod teams. The app should not have been created prior to the content period.

The Best Ported App: This award recognizes the most successful migration of an existing Data API moderation bot or tool* to Devvit. The winning submission will maintain the bot’s core utilityand can be generalized to serve many communities through app install. You should be the bot owner, or have written permission to port the bot you are submitting for this event.

*Existing Data API bots must have been operating on Reddit prior to March 2026 and support one or more existing communities with 500 or more Weekly Active Users. These can be mod tools, utilities, or anything else that improves the day-to-day functioning of an existing Reddit community. Apps not built with Reddit's Data API do not count towards this category.

Requirements
Apps must be built on Reddit's Developer Platform and be compliant with our Devvit Rules.

For this event we are looking for polish, meaning apps that are as close to launch-ready as possible. We understand that not all projects will reach this threshold, but projects that are well tested and concept-complete will score higher.

Getting started

Get started with the Devvit documentation for moderation apps.
Review our bot porting guide on migrating Data API bots to Devvit.
Join us on Discord and r/Devvit for live support and office hours
Sustaining Success

Successful apps built during the hackathon can become eligible for Reddit Developer Funds, which rewards apps for reaching engagement milestones. Learn more about the program here. Successful ports can also be eligable for a porting bounty via our App Migration Program.

Need inspiration?

Join our Discord to chat with other developers and get live support from the Reddit team.

Requirements
What to Submit

App listing – Link to your app on developer.reddit.com.
Reddit usernames – List all team participant's Reddit usernames.

Tool Overview –Describe in detail the functionality of the bot. Include all capabilities and how moderators and users are intended to use the app
Project Impact – List 1-3 communities that you think would find this app useful and how you see moderators/communities benefiting. We’re looking for community impact, time savings for moderators, etc.
[For Ported Projects] Original Bot username – Please list the u/name of the bot you ported for this category
[For Ported Projects] Port Completion – Describe any differences, improvements, or gaps between your new app and the original bot. Could this app be installed today and serve the original function of the app?


Judging Criteria
Community Impact
To what degree does this tool significantly save moderate time or improve community engagement?
Polish
Your submission should be as close to publishable as possible and compliant with Devvit Rules.
Reliable UX
The tool should be easy for a mod to install and configure and work reliably at scale.
[For the Port Category] Port Completion
How close is this app to replacing an existing ported bot or tool that supports an active community? Apps that can be transferred today will get full scoring.
[For the New Mod Tool] Ecosystem Impact
Does this bring a net new tool or functionality to the Devvit ecosystem? Does it have broad moderator appeal?
Feedback Award Criteria
We are looking for detailed, candid, actionable, and constructive feedback. This may include specific feature requests, details which resources are most or least helpful, bugs and issues encountered, process improvements etc.
Helper Award Criteria
We are looking for signals from your fellow contestants that the time you took to help them genuinely improved their experience. This can be active support in our communities, playtesting apps, sharing code snippets, troubleshooting issues, etc.


https://developers.reddit.com/docs/introduction/intro-mod-tools
https://developers.reddit.com/docs/guides/migrate/public-api
https://developers.reddit.com/docs/guides/launch/launch-guide
https://developers.reddit.com/docs/devvit_rules
https://developers.reddit.com/docs/


Here is my idea:

So basically, I kind of want to make a kind of mod tool specifically for r slash CS majors. So if you can look at a CS majors rules right now, there's a few different things that is pretty much difficult to use regex for. Traditionally, so you have CS majors rules, like one of them is out of scope. It says this subreddit is for discussion related to university level and other education in computer science and related fields. And for more general university questions, please check out r slash college. Questions that are more about career slash jobs and they're about college CS, please check out CS career questions. So not only do we have very specific rules, we also have, it also seems like we have like to do steps for these things. If something fails or something ends up being like out of scope or out of the rules, then we have a certain like next step that we have. Similarly, I think that we also have other rules that are very difficult to look at, such as shitposts and memes. And so there's not a lot without mod authorization, except on Sundays. Please use a subreddit like r slash programming humor instead otherwise. So we have like certain things that are very difficult to look at regex wise. And some of these mod rules are very difficult to kind of like make regex wise. And so sometimes what you'd have to do is make your own system. So either you'd have to create like a rules for regex and do that with AI, or you can make an AI like thing. So you just make like a GPT call to see if it like fits within the rules or not. And there's a lot of data we need from that post, obviously, but all in all, that's like what the general kind of problem that I want to solve is. So let's say like r slash CS majors has like 10 different rules right now, it's out of scope, respectful engagement, shitpost memes, AMAs, surveys, hiring for roles, blah, blah. Resume sticky, it says there's one for Amazon. There's one for discussing online assessments, it's obviously not in that. There's one on spam, there's one on low quality posts, there's common questions, there's AI. So obviously that AI-generated content test is gonna be difficult. It's gonna be college comparison posts, laptop posts, posts about restricted items, like if CS4ME, blah, blah. I'm in this personal project post. So there's a lot of these things that actually end up leaking out that violate the terms, but end up leaking into the real place anyways. So that's kind of what we need to solve here. And I think we can do that in a lot of different ways. Obviously, off the bat, I'm kind of deciding, like, first of all, for this hackathon, what exactly are we going to build to solve this? Like, how specific are we going to build this? Like, we could start by building out the entire system from scratch, like, create, like, a moderation tool that looks at every single one. Or we can also just, like, you know, keep it very, very simple and just say, like, hey, let's just build out the out-of-scope detector or, like, a should-post meme detector. Or we can go one step above that and say, hey, let's build a rules decider. Or we can go even one step above that and say, let's create a English-to-Regex or, like, that kind of, like, rule detector. Or we can even go one step above that and say, let's make a GPT analyzer to, or like, like an AI analyzer to look at, um, to decide whether something is out of scope or not. Or we can go one step above that and say, um, let's create an orchestration layer so that anything that's out of scope or whatever can end up going to, like, the next steps that they've laid out for us. Or we can go one step above that and say, let's make a, uh, um, a rule generator, so, like, the rule actually, so like, the mods can actually make rules, so it can be like the programming or something. And we can have like an AI tool, obviously, to, you know, kind of help them assist with that process. So, there's a lot of things that we can do here. I think that mod tool, like, where they automatically, like, build, and there's like an AI-assisted layer to this where they can automatically build, um, dynamic rules. would be one of the coolest features, I think. So let's try to do that, but obviously there's like one question that I really have is like, you know, what do we really want, what do we really want to do for this hackathon? Like, what is the most like specific thing that we should be doing?
