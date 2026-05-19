# RulePilot Privacy Policy

RulePilot processes subreddit post data only for moderation triage in communities where the app is installed.

## Data Processed

RulePilot may process:

- post title;
- post body text;
- post flair text;
- post URL domain;
- subreddit name;
- post id and permalink;
- RulePilot classification result, confidence, action, and moderator feedback.

RulePilot does not collect or process author history, private profile data, subscribed subreddits, voting history, saved content, recently viewed content, or cross-subreddit behavior.

## OpenAI Use

If a moderator enables LLM classification and the app developer configures an OpenAI API key, RulePilot may send the post title, body excerpt, flair text, URL domain, and configured rule text to OpenAI for structured classification.

RulePilot does not use Reddit data to train, fine-tune, or improve AI models. RulePilot is configured for moderation triage only.

## Storage

RulePilot stores audit records in Devvit Redis for the app installation. Stored records are scoped to the subreddit installation and are used for moderator review, dashboard stats, and false-positive feedback.

Redis audit records expire after 30 days. If Reddit sends a post deletion event, RulePilot deletes the matching audit record so deleted post titles and permalinks are not retained in the dashboard.

## Data Sharing

RulePilot does not sell, license, or share Reddit user data for advertising, data brokerage, surveillance, or model training.

## Contact

Contact the app developer through the Reddit app listing or Reddit modmail path provided in the app listing.
