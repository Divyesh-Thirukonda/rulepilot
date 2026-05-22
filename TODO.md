# RulePilot TODO

Note: Whenever more things need to be added to the todo like when you discover new work, update the todo by adding it as a child under the relevent parent item (phase, feature, task, or subtask)

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
- [x] Set and verify the OpenAI secret with `npx devvit settings set openai-api-key`.
- [ ] Create a dashboard custom post from the subreddit menu and verify moderator-only access.
- [ ] Run the golden r/csMajors cases against the live playtest:
  - [ ] career-only post routes to r/cscareerquestions guidance;
  - [ ] live OA question is flagged;
  - [ ] practice OA question is allowed or low-confidence;
  - [ ] Monday meme is flagged;
  - [ ] Sunday meme is allowed;
  - [ ] disrespectful engagement post is flagged;
  - [ ] lazy or low-quality post routes to review.
- [ ] Record screenshots for app listing and Devpost:
  - [ ] dashboard overview;
  - [ ] case row with explanation;
  - [ ] Rule Studio rule list;
  - [ ] moderator feedback buttons;
  - [ ] install settings.
- [ ] Add a short demo script showing submission, triage, dashboard review, and feedback.
- [x] Add demo smoke coverage so the AI Builder retries real OpenAI structured-output failures and surfaces detailed errors instead of creating local fallback drafts.
  - [x] Add `npm run test:ai-builder:live` for pre-demo real OpenAI smoke testing of common moderator prompts.
  - [x] Run `OPENAI_API_KEY=... npm run test:ai-builder:live` before the final demo.
  - [x] Add and run `npm run test:classification:live` for real OpenAI classification schema/evidence smoke testing before the final demo.
- [ ] Fill out app listing copy, privacy policy link, terms link, and support/contact path.
  - [x] Refresh README and Devpost/app-listing draft copy to match the current Rule Studio, Cases, and RulePilot Builder UX.
- [ ] Publish only after verifying post-delete cleanup and Redis retention behavior in playtest logs.

## P1: UX And Design Polish

- [x] Make the dashboard feel like a mature moderation console instead of a quick prototype:
  - [x] compact table or split-list layout for repeat scanning;
  - [x] clear rule, confidence, action, and feedback columns;
  - [x] right-side detail panel or expandable case detail;
  - [x] restrained colors with strong status semantics;
  - [x] improved typography, spacing, and empty states.
  - [x] align dashboard colors with Reddit Product Language semantic theme tokens.
  - [x] Follow-up: add keyboard row navigation for the case table.
  - [x] Give the RulePilot AI Builder controls, template cards, and prompt field more breathing room.
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
  - [x] remove case-detail redirect/routing guidance from the hackathon demo surface;
  - [ ] feedback history.
- ... [ ] Add sorting by newest, confidence, rule, and action.
- ... [ ] Improve mobile layout for moderator review on phones.
- ... [ ] Add loading, error, empty, and restricted-access states that look intentional.
- ... [ ] Add a first-run dashboard checklist that tells mods what still needs configuration without exposing it to regular users.

## P1: Rule Studio For Mod-Built Rules
Think like we're basically giving them conditions (datetime = sunday [from datetime], body = lazy [ ai-classifications, either lazy, spam, rude, and custom descriptions, etc ], spam = true, etc) and actions [add to mod queue, auto approve, auto ban for x hours, etc]

- [x] Build a `Rule Studio` dashboard tab where moderators can create, edit, disable, import, and export rules.
- [x] Move from hardcoded preset-only rules to `RuleConfigV2` stored per subreddit in Redis.
- [x] Keep the r/csMajors preset as an installable starter pack, not the only supported rule set.
- [x] Add rule fields:
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
- [x] Add rule conditions:
  - [x] keyword or phrase matches;
  - [x] regex matches;
  - [x] post type: text, link, media, poll, crosspost;
  - [x] flair text;
  - [x] URL domain;
  - [x] title/body length;
  - [x] day of week;
  - [x] time window using subreddit timezone;
  - [x] custom semantic category such as spam, low quality, rude, meme, survey, hiring, referral, AI/LLM policy, or custom topic.
- [x] Add a hackathon-demo rule simulator:
  - [x] paste a sample post title/body/flair/url;
  - [x] choose post type and sample datetime;
  - [x] run deterministic checks for the current draft rule;
  - [x] show which conditions matched or missed;
  - [x] clearly label semantic conditions as requiring LLM classification.
- ... [ ] Add import/export JSON for sharing rule packs across subreddits.

## P1: Better LLM Classification

- [x] Improve the OpenAI prompt to be more conservative and rubric-based.
- [x] Enrich the structured feature payload sent to the LLM:
  - [x] title / body excerpt;
  - [x] flair text;
  - [x] URL domain;
  - [x] post kind (text, link, media, poll, crosspost);
  - [x] created weekday and local time using the subreddit timezone setting;
  - [x] enabled rules only;
  - [x] body/title quality indicators when available (length, presence of links, presence of media, question-mark heuristic).
- [x] Ask the LLM for evidence spans or short evidence bullets, not just a generic rationale.
- [x] Add an explicit `insufficient_context` outcome.
- [x] Add rule-specific confidence calibration:
  - [x] memes can be high-confidence from signals;
  - [x] out-of-scope should require strong evidence;
  - [x] low-quality should default to needs-review;
  - [x] AI/LLM policy should classify policy topic, not AI-authorship.
- [x] Upgrade the five r/csMajors starter rules to semantic-first classifier rubrics instead of keyword-only gates.
- [x] Sync authoritative preset rules over existing `source: preset` Redis copies so playtest installs see the improved seeded rules.
- ... [ ] Add a circuit breaker:
  - [ ] disable LLM calls after repeated failures;
  - [ ] fall back to deterministic-only mode;
  - [ ] surface the failure in dashboard health.
- ... [ ] Add prompt/version metadata to each case record so false positives can be traced to prompt changes.

## P1: Rerouting Instead Of Removal

- [x] Add first-class routing actions:
  - [x] no action;
  - [x] log only;
  - [x] flag/report for review;
  - [x] filter to mod queue;
- [x] Add redirect metadata to rules without making it an automatic messaging/removal system:
  - [x] `redirectTargetType`: subreddit, megathread, URL, or custom;
  - [x] `redirectTarget`: subreddit name, manually configured megathread, URL, or custom label;
  - [x] `redirectTemplate`: moderator-facing guidance text;
  - [x] legacy `redirect` still falls back as guidance when structured fields are missing.
- [x] Add redirect templates:
  - [x] "Please post this in r/cscareerquestions";
  - [x] "Please use the resume sticky";
  - [x] "Please use the weekly questions thread";
  - [x] "Please use r/college for general college questions";
  - [x] custom subreddit or wiki URL.
- [x] Move to megathread: One of the rerouting options should be to move posts to a megathread, if the subreddit has a megathread posted for that particular topic.
  - [x] MVP uses manually configured megathread title or URL; no automatic sticky discovery.
- [x] Move to different subreddit: Add a "Create draft to r/X" button: when a post is rerouted, send the user a message with a pre-filled draft link so they can easily repost to the suggested subreddit instead of just being told "post elsewhere" (like how it says please post to r/X instead and a create draft button can be messaged to the user in that case).
  - [x] MVP opens a moderator-facing Reddit submit URL only; it does not send the author a DM.
- [x] Avoid automated unsolicited DMs. Prefer moderator-confirmed comments, removal reasons, or dashboard copy.
  - [x] Removed the case-detail routing guidance panel from the final demo UI.
  - [x] Kept redirect metadata editable in Rule Studio without showing the legacy guidance block in Recent Cases.
- ... [ ] Escalate to ban: Escalate to mod with suggested temporary ban (12 hours by default, duration editable by mod) — mod must confirm before any account action is taken.
- ... [ ] Keep account actions out of the MVP. For spammer rules, show "escalate to mod" / "suggest temporary ban (X hours/days)" only after explicit moderator confirmation and only if Devvit API support and policy review are clear.
- ... [x] If the rule the author violated is fixable, allow the mod to create a new post for the user with the same content as the original but with the rule fixed (maybe the edited post can just be sent back to the user as a draft for them ready to be posted, they can choose to edit it further if needed). For example, if a user posts a meme on a weekday, the mod can send the user a DM with the meme as a draft with instructions to post on a weekend post instead (or it could be a draft and instead of instructions, we have it scheduled for the weekend automatically, but again the user might not understand why it's scheduled for the weekend so maybe an instruction note would be needed in the dm). Plan this out, and idek if this is a featue in the devvit so figure that out too.
  - [x] MVP uses mod-facing fixed-post draft links instead of automatic DMs or scheduling.
  - [x] Drafts include the original post link and repair guidance, but do not store or copy the full original post body.


## P1: AI-Assisted Rule Builder

- [x] Build `RulePilot AI Builder`, a mod-facing assistant for drafting rules (cuz at the end of the day, we dont wanna develop the rules FOR the mods, that's what they'll be doing perhaps with the help of an ai to help them develop a rule themselves, so we need a way for mods to develop these rules).
- [x] Treat the builder as a tool-oriented workflow:
  - [x] parse moderator intent;
  - [x] ask clarifying questions when the rule is ambiguous;
  - [x] generate a draft `RuleConfigV2`;
  - [x] generate deterministic conditions where possible;
  - [x] generate the LLM rubric only for ambiguous parts;
  - [x] generate positive and negative test cases;
  - [x] simulate the draft against examples;
  - [x] save as a disabled draft until a mod enables it.
- [x] Consider an MCP-esque internal architecture for local development if it helps, but do not add platform complexity unless it clearly improves the product.
  - [x] Chose ordinary server helpers and one structured OpenAI call; no MCP-style runtime added for the hackathon MVP.
- [x] Button to auto-import all written rules from in the subreddit rule section and auto-populate the rules for no rules exist in studio (like they're yet to be imported) and of course some rules may not exist, for which an llm prompt will be generated to generate the rules based on the subreddit's content and the moderator's intent.
  - [x] Remove the previous 10-rule import cap so all subreddit rules returned by Devvit `getRules()` are drafted.
  - [x] Add live OpenAI import-mode audit coverage for the 15 r/csMajors-style written rules.
- [x] Keep the AI Builder focused on natural-language rule drafting and subreddit-rule import.
  - [x] Remove one-click template buttons from the Rule Studio demo surface.
  - [x] Update the natural-language placeholder to `only allow satire / ragebait posts on Sundays`.
  - [x] Hide `Import subreddit rules` after the first successful import in the current browser.
  - [x] Harden common-rule generation so subjective rules avoid fake keyword/regex gates and deterministic conditions are required only for explicit fields such as URL domain, flair, post type, length, day, and time.
- [x] Add validation so AI-generated rules cannot:
  - [x] inspect author history;
  - [x] call unapproved external services;
  - [x] schedule broad crawls;
  - [x] auto-ban users;
  - [x] claim reliable AI-generated-text detection.
- [x] Refine AI Builder prompt generation so semantic conditions become classifier-ready rubrics:
  - [x] tell OpenAI that `semantic` condition values are future classifier prompts, not labels;
  - [x] add broad common-intent guidance for typical moderator prompts such as AI slop, spam, low effort, rude engagement, surveys, hiring, resume megathreads, homework, live OA/interview content, out-of-scope posts, buying advice, recurring restricted topics, formatting, and project showcases;
  - [x] expand weak generated semantic labels into rubrics before saving disabled drafts.
- [x] Clean up Rule Studio rule-editing UX:
  - [x] keep each simulator collapsed by default behind a `>` / `v` toggle;
  - [x] add clear `Conditions` and `Actions` dividers;
  - [x] keep threshold at the end of the Conditions section;
  - [x] make routing action the first field in the Actions section;
  - [x] align edit, delete, import, export, and draft buttons with Reddit-themed colors.
  - [x] move import/export/subreddit-rule import controls outside and below the Rule Studio panel, centered.
  - [x] replace the header `+` with a single Rule Studio `+` action below the rules that opens the AI Builder in a modal.
  - [x] show generated drafts below the existing rule list so mods can manually edit the full rule before saving.
  - [x] Replace sandbox-blocked `window.confirm()` delete flow with inline delete confirmation in the rule editor.
  - [x] Remove the redundant Rule Studio title/count header above the rule list.
  - [x] Make the Rule Builder prompt optional so `Draft rule` can open a blank disabled rule template.

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
- ... [x] Remove the generic education subreddit pack from the hackathon demo scope.
- ... [ ] Add a generic "career subreddit" pack for r/cscareerquestions-style communities.
- ... [ ] Add rule pack metadata:
  - [ ] source community;
  - [ ] intended use;
  - [ ] required settings;
  - [ ] known false-positive risks;
  - [ ] example posts.

## P1: Working With Existing Reddit Mod Tooling

- [x] Add a "RulePilot did nothing because AutoModerator already acted" status when detectable.
- [x] Add documentation explaining how RulePilot should be layered with subreddit rules, AutoModerator, removal reasons, and mod queue.
- ... [ ] Add an AutoModerator-compatible mindset:
  - [ ] deterministic rules first;
  - [ ] semantic triage only when regex/keywords are insufficient;
  - [ ] show when a rule could be better handled by AutoModerator.
- [x] Consider listening to `onAutomoderatorFilterPost` only to annotate or measure cases that AutoModerator already filtered, not to duplicate its work.
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
