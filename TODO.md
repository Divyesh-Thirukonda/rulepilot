# RulePilot TODO

Last updated: 2026-05-18

[x] = done 
[ ] = pending
... = not critical for hackathon but will improve the product (so ignore these until all [!],[!!],[!!!],[!...] are marked done)
!!! = critical for hackathon
!.. = do a few (2-3)

## Product Guardrails

- [ ] Keep RulePilot as a human-in-the-loop triage layer, not a replacement for Reddit safety tooling, AutoModerator, or the native mod queue.
- [ ] Stay event-driven: new post submission triggers and explicit moderator menu scans only. No recurring hourly scanners, no historical crawling, and no cross-subreddit behavior analysis.
- [ ] Default to reversible review actions: monitor, report/flag, or filter to mod queue. Avoid permanent removal or account actions unless a moderator explicitly confirms.
- [ ] Do not store author names, author history, private profile data, cross-subreddit activity, voting history, saved content, or recently viewed content.
- [ ] Keep Redis records bounded: 30-day TTL, post-delete cleanup, and no full post body stored in audit records.
- [ ] Keep LLM usage optional, disclosed, and limited to post title, body excerpt, flair, URL/domain, configured rule text, and post datetime features.

## P0: Hackathon Submission Readiness

- [ ] Complete live playtest in `r/rulepilot_dev` with `monitor` mode first, then `flag`, then `filter`.
- [ ] Set and verify the OpenAI secret with `npx devvit settings set openai-api-key`.
- [ ] Create a dashboard custom post from the subreddit menu and verify moderator-only access.
- [ ] Run the golden r/csMajors cases against the live playtest:
  - [ ] career-only post routes to r/cscareerquestions guidance;
  - [ ] resume post routes to sticky guidance;
  - [ ] live OA question is flagged;
  - [ ] practice OA question is allowed or low-confidence;
  - [ ] Monday meme is flagged;
  - [ ] Sunday meme is allowed;
  - [ ] laptop post matches laptop rule;
  - [ ] college comparison matches college comparison rule;
  - [ ] personal project post matches personal projects rule;
  - [ ] survey, hiring, and referral posts match the approval/routing rule.
- [ ] Record screenshots for app listing and Devpost:
  - [ ] dashboard overview;
  - [ ] case row with explanation;
  - [ ] enabled rules list;
  - [ ] moderator feedback buttons;
  - [ ] install settings.
- [ ] Add a short demo script showing submission, triage, dashboard review, and feedback.
- [ ] Fill out app listing copy, privacy policy link, terms link, and support/contact path.
- [ ] Publish only after verifying post-delete cleanup and Redis retention behavior in playtest logs.

## P1: UX And Design Polish

- !!! [x] Make the dashboard feel like a mature moderation console instead of a quick prototype:
  - [x] compact table or split-list layout for repeat scanning;
  - [x] clear rule, confidence, action, and feedback columns;
  - [x] right-side detail panel or expandable case detail;
  - [x] restrained colors with strong status semantics;
  - [x] improved typography, spacing, and empty states.
  - [x] align dashboard colors with Reddit Product Language semantic theme tokens.
  - [x] Follow-up: add keyboard row navigation for the case table.
  - [ ] Follow-up: verify token rendering inside the live Reddit webview in both light and dark mode. (blocked: private playtest requires a logged-in approved moderator session)
    - [ ] Open `https://www.reddit.com/r/rulepilot_dev/?playtest=rulepilot` while logged in as an approved moderator.
    - [ ] Create/open the RulePilot dashboard custom post in light mode and confirm semantic tokens render correctly.
    - [ ] Switch Reddit to dark mode, refresh the dashboard webview, and confirm semantic tokens render correctly.
- ... [ ] Add dashboard filters:
  - [ ] all cases;
  - [ ] needs feedback;
  - [ ] false positives;
  - [ ] high confidence;
  - [ ] rule id;
  - [ ] action taken.
- ... [ ] Add a case detail view with:
  - [ ] matched rule;
  - [ ] evidence snippets;
  - [ ] rationale;
  - [ ] suggested moderator action;
  - [ ] redirect guidance;
  - [ ] feedback history.
- ... [ ] Add sorting by newest, confidence, rule, and action.
- ... [ ] Improve mobile layout for moderator review on phones.
- ... [ ] Add loading, error, empty, and restricted-access states that look intentional.
- ... [ ] Add a first-run dashboard checklist that tells mods what still needs configuration without exposing it to regular users.

## P1: Rule Studio For Mod-Built Rules
Think like we're basically giving them conditions (datetime = sunday [from datetime], body = lazy [ ai-classifications, either lazy, spam, rude, and custom descriptions, etc ], spam = true, etc) and actions [add to mod queue, auto approve, auto ban for x hours, etc]

- !!! [x] Build a `Rule Studio` dashboard tab where moderators can create, edit, disable, import, and export rules.
- !!! [x] Move from hardcoded preset-only rules to `RuleConfigV2` stored per subreddit in Redis.
- !!! [x] Keep the r/csMajors preset as an installable starter pack, not the only supported rule set.
- !!! [x] Add rule fields:
  - [x] title;
  - [x] plain-English description;
  - [x] examples that should match;
  - [x] examples that should not match;
  - [x] threshold;
  - [x] category;
  - [x] enabled/disabled state;
  - [x] suggested action;
  - [x] redirect guidance;
  - [x] mod-only notes.
- !!! [x] Add rule conditions:
  - [x] keyword or phrase matches;
  - [x] regex matches;
  - [x] post type: text, link, media, poll, crosspost;
  - [x] flair text;
  - [x] URL domain;
  - [x] title/body length;
  - [x] day of week;
  - [x] time window using subreddit timezone;
  - [x] custom semantic category such as spam, low quality, rude, meme, survey, hiring, referral, AI/LLM policy, or custom topic.
- !!! [x] Add a hackathon-demo rule simulator:
  - [x] paste a sample post title/body/flair/url;
  - [x] choose post type and sample datetime;
  - [x] run deterministic checks for the current draft rule;
  - [x] show which conditions matched or missed;
  - [x] clearly label semantic conditions as requiring LLM classification.
- ... [ ] Add import/export JSON for sharing rule packs across subreddits.

## P1: Better LLM Classification

- !!! [ ] Improve the OpenAI prompt to be more conservative and rubric-based.
- !!! [ ] Enrich the structured feature payload sent to the LLM (currently `postForModel` only sends title, body, flair, urlDomain):
  - [ ] title / body excerpt (keywords / regex);
  - [ ] flair text;
  - [ ] URL domain;
  - [ ] post kind (text, link, media, poll, crosspost);
  - [ ] created weekday and local time using the subreddit timezone setting;
  - [ ] enabled rules only;
  - [ ] body/title quality indicators when available (length, presence of links, presence of media, question-mark heuristic).
- !!! [ ] Ask the LLM for evidence spans or short evidence bullets, not just a generic rationale.
- !!! [ ] Add an explicit `insufficient_context` outcome.
- !!! [ ] Add rule-specific confidence calibration:
  - [ ] memes can be high-confidence from signals;
  - [ ] out-of-scope should require strong evidence;
  - [ ] low-quality should default to needs-review;
  - [ ] AI/LLM policy should classify policy topic, not AI-authorship.
- ... [ ] Add a circuit breaker:
  - [ ] disable LLM calls after repeated failures;
  - [ ] fall back to deterministic-only mode;
  - [ ] surface the failure in dashboard health.
- ... [ ] Add prompt/version metadata to each case record so false positives can be traced to prompt changes.

## P1: Rerouting Instead Of Removal

- !!! [ ] Add first-class routing actions:
  - [ ] no action;
  - [ ] log only;
  - [ ] flag/report for review;
  - [ ] filter to mod queue;
  - [ ] suggest redirect;
  - [ ] suggest megathread;
  - [ ] suggest removal reason;
  - [ ] escalate to mod with suggested temporary ban (X hours/days) — mod must confirm before any account action is taken.
- !!! [ ] Add redirect templates:
  - [ ] "Please post this in r/cscareerquestions";
  - [ ] "Please use the resume sticky";
  - [ ] "Please use the weekly questions thread";
  - [ ] "Please use r/college for general college questions";
  - [ ] custom subreddit or wiki URL.
- !!! [ ] One of the rerouting options should be to move posts to a megathread, if the subreddit has a megathread posted for that particular topic.
but with the rule fixed.
- !!! [ ] Add a "Copy redirect" or "Create mod-reviewed redirect draft" action.
- !!! [ ] Add a "Create draft to r/X" button: when a post is rerouted, send the user a message with a pre-filled draft link so they can easily repost to the suggested subreddit instead of just being told "post elsewhere" (like how it says please post to r/X instead and a create draft button can be messaged to the user in that case).
- !!! [ ] Avoid automated unsolicited DMs. Prefer moderator-confirmed comments, removal reasons, or dashboard copy.
- !!! [ ] Keep account actions out of the MVP. For spammer rules, show "escalate to mod" or "suggest temporary ban (X hours/days)" only after explicit moderator confirmation and only if Devvit API support and policy review are clear.
- ... [ ] If the rule the author violated is fixable, allow the mod to create a new post for the user with the same content as the original but with the rule fixed (maybe the edited post can just be sent back to the user as a draft for them ready to be posted, they can choose to edit it further if needed). For example, if a user posts a meme on a weekday, the mod can send the user a DM with the meme as a draft with instructions to post on a weekend post instead (or it could be a draft and instead of instructions, we have it scheduled for the weekend automatically, but again the user might not understand why it's scheduled for the weekend so maybe an instruction note would be needed in the dm).


## P1: AI-Assisted Rule Builder

- !!! [ ] Build `RulePilot AI Builder`, a mod-facing assistant for drafting rules (cuz at the end of the day, we dont wanna develop the rules FOR the mods, that's what they'll be doing perhaps with the help of an ai to help them develop a rule themselves, so we need a way for mods to develop these rules).
- !!! [ ] Treat the builder as a tool-oriented workflow:
  - [ ] parse moderator intent;
  - [ ] ask clarifying questions when the rule is ambiguous;
  - [ ] generate a draft `RuleConfigV2`;
  - [ ] generate deterministic conditions where possible;
  - [ ] generate the LLM rubric only for ambiguous parts;
  - [ ] generate positive and negative test cases;
  - [ ] simulate the draft against examples;
  - [ ] save as a disabled draft until a mod enables it.
- !!! [ ] Consider an MCP-esque internal architecture for local development if it helps, but do not add platform complexity unless it clearly improves the product.
- !!! [ ] Button to auto-import all written rules from in the subreddit rule section and auto-populate the rules for no rules exist in studio (like they're yet to be imported) and of course some rules may not exist, for which an llm prompt will be generated to generate the rules based on the subreddit's content and the moderator's intent.
- !.. [ ] Add one-click and natural language rule creation flows:
  - [ ] "Only allow memes on Sundays";
  - [ ] "Route resume posts to a megathread";
  - [ ] "Require approval for surveys";
  - [ ] "Flag hiring/referral posts";
  - [ ] "Flag live interview or OA question sharing";
  - [ ] "Route laptop buying advice elsewhere";
  - [ ] "Flag Amazon-specific posts";
  - [ ] "Flag custom restricted topic".
- ... [ ] Add validation so AI-generated rules cannot:
  - [ ] inspect author history;
  - [ ] call unapproved external services;
  - [ ] schedule broad crawls;
  - [ ] auto-ban users;
  - [ ] claim reliable AI-generated-text detection.

## P1: Common Rule Library

- !.. [ ] Add reusable rule templates:
  - [ ] memes / shitpostsonly on Sundays or holidays;
  - [ ] survey approval required;
  - [ ] hiring/referral approval required;
  - [ ] resume megathread redirect;
  - [ ] buying advice redirect;
  - [ ] college comparison redirect;
  - [ ] homework help boundary;
  - [ ] live interview/OA content boundary;
  - [ ] low-effort question;
  - [ ] self-promotion/spam;
  - [ ] civility or respectful engagement;
  - [ ] spoiler/title formatting;
  - [ ] link-domain allowlist or blocklist;
  - [ ] custom restricted topic.
- !!! [ ] Add a generic "education subreddit" pack for r/EngineeringStudents-style communities.
- ... [ ] Add a generic "career subreddit" pack for r/cscareerquestions-style communities.
- ... [ ] Add rule pack metadata:
  - [ ] source community;
  - [ ] intended use;
  - [ ] required settings;
  - [ ] known false-positive risks;
  - [ ] example posts.

## P1: Working With Existing Reddit Mod Tooling

- !!! [ ] Add a "RulePilot did nothing because AutoModerator already acted" status when detectable.
- !!! [ ] Add documentation explaining how RulePilot should be layered with subreddit rules, AutoModerator, removal reasons, and mod queue.
- ... [ ] Add an AutoModerator-compatible mindset:
  - [ ] deterministic rules first;
  - [ ] semantic triage only when regex/keywords are insufficient;
  - [ ] show when a rule could be better handled by AutoModerator.
- ... [ ] Consider listening to `onAutomoderatorFilterPost` only to annotate or measure cases that AutoModerator already filtered, not to duplicate its work.
- ... [ ] Consider `onModAction` only for posts RulePilot touched, so the app can learn aggregate outcomes without broad modlog mining.

## P2: Evaluation And Reliability

- ... [ ] Add a local evaluation runner over golden cases.
- ... [ ] Add confusion-matrix output by rule.
- ... [ ] Add threshold tuning scripts.
- ... [ ] Add regression tests for every common rule template.
- ... [ ] Add tests for post-delete cleanup and Redis TTL behavior.
- ... [ ] Add idempotency tests for repeated trigger delivery.
- ... [ ] Add tests for LLM malformed JSON, refusal, timeout, and empty response cases.
- ... [ ] Add load-minded tests for many recent cases in Redis.
- ... [ ] Add dashboard API tests for non-moderator rejection.

## P2: Observability And Admin Health

- ... [ ] Add a dashboard health panel:
  - [ ] LLM enabled/disabled;
  - [ ] OpenAI key configured/missing;
  - [ ] last LLM error;
  - [ ] deterministic-only fallback status;
  - [ ] case retention policy;
  - [ ] installed preset version.
- ... [ ] Add lightweight counters:
  - [ ] scans run;
  - [ ] LLM calls;
  - [ ] deterministic matches;
  - [ ] filter/report/log actions;
  - [ ] feedback counts.
- ... [ ] Add cost controls:
  - [ ] max body excerpt length;
  - [ ] max LLM calls per hour per subreddit;
  - [ ] skip LLM when deterministic confidence is already decisive;
  - [ ] admin-visible rate-limit status.

## P2: Feedback And Learning Loop

- ... [ ] Replace the binary feedback model with richer labels:
  - [ ] correct;
  - [ ] false positive;
  - [ ] missed violation;
  - [ ] wrong rule;
  - [ ] right rule but wrong action;
  - [ ] confidence too high;
  - [ ] confidence too low;
  - [ ] rationale unclear;
  - [ ] redirect guidance wrong;
  - [ ] partial match.
- ... [ ] Allow moderators to attach a short note to feedback.
- ... [ ] Add per-rule false-positive and false-negative rates.
- ... [ ] Add a "needs tuning" view for rules with repeated feedback issues.
- ... [ ] Add a feedback export for offline review.
- ... [ ] Add a "create test from feedback" button that turns a corrected case into a golden test.
- ... [ ] Add automatic threshold suggestions, but keep final threshold changes mod-confirmed.

## P3: Future Ideas

- ... [ ] Comment triage after post triage is stable.
- ... [ ] Modmail summary for disputed RulePilot cases, if compliant and useful.
- ... [ ] Rule pack marketplace or import gallery.
- ... [ ] Team review workflow where one mod drafts a rule and another enables it.
- ... [ ] Scheduled rule windows for events such as finals week, recruiting season, or weekly megathreads, but without scanning old content.
- ... [ ] Multi-community analytics for the app developer only if aggregated, privacy-preserving, compliant, and clearly disclosed.
- ... [ ] In-dashboard onboarding walkthrough for new mod teams.
- ... [ ] Demo mode with synthetic posts so reviewers can inspect the app without real community data.
