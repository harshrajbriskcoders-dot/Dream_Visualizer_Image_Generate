# Dream Visualizer

AI "see what your space could become" tool and community gallery for dreamoutdoorliving.life.

A visitor uploads a photo of their yard, fills in a short form, and gets an AI redesign with a before/after slider. Approved designs appear in a public gallery.

## What's in here

```
api/submit.js        POST: checks the form, saves the photo, makes the AI design, saves the record
api/gallery.js       GET: approved designs for the gallery
api/options.js       GET: the form's questions and answers
lib/options.js       The three questions and their answers (edit here)
lib/prompt.js        Turns answers into the AI prompt
lib/ai.js            Cloudflare Workers AI call (swap this file to change AI provider)
lib/cloudinary.js    Image upload and URLs
lib/db.js            MongoDB connection
lib/validate.js      Server-side form checks
lib/turnstile.js     Spam check
lib/http.js          CORS, IP hashing, small helpers
scripts/try-ai.js    Test the AI on one photo from your computer
test/                Unit tests (npm test)
shopify/sections/dream-visualizer.liquid   The Shopify section (upload, form, result, gallery)
```

Stack: Node.js on Vercel, MongoDB Atlas, Cloudinary, Cloudflare Workers AI (FLUX.2 [klein] 4B), Cloudflare Turnstile. All free tiers.

## 1. Create the accounts

**MongoDB Atlas**
1. Create a free M0 cluster.
2. Database Access: add a database user with a strong password.
3. Network Access: add `0.0.0.0/0`. Vercel doesn't have fixed IP addresses, so this is required.
4. Connect > Drivers: copy the connection string into `MONGODB_URI` and put your password in it.

**Cloudinary**
1. Sign up for the free plan.
2. On the API Keys page, copy the API environment variable (`cloudinary://...`) into `CLOUDINARY_URL`.

**Cloudflare Workers AI**
1. Sign up for a free Cloudflare account.
2. Go to AI > Workers AI > Use REST API.
3. Copy your Account ID into `CF_ACCOUNT_ID`.
4. Create a Workers AI API token and copy it into `CF_API_TOKEN`.

**Cloudflare Turnstile** (spam protection)
1. In the Cloudflare dashboard, open Turnstile > Add widget.
2. Add hostnames `dreamoutdoorliving.life` and the store's `.myshopify.com` domain. Choose Managed mode.
3. The site key goes in the Shopify theme editor. The secret key goes in `TURNSTILE_SECRET_KEY`.

## 2. Test on your computer

You need Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local      # then fill in the values
npm test                        # unit tests, no accounts needed
npm run try:ai -- ./backyard.jpg
```

`try:ai` uploads the photo to Cloudinary, runs the AI and prints the before and after links. Use it to check image quality and to tune `lib/prompt.js` before going live. It doesn't use MongoDB.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, select Add New > Project and import the repository. No build settings are needed.
3. Under Settings > Environment Variables, add every key from `.env.example`.
4. Deploy, then open `https://YOUR-APP.vercel.app/api/options`. You should see the questions as JSON.

Set `ALLOWED_ORIGINS` to the exact sites that will use the form, for example `https://dreamoutdoorliving.life,https://dream-outdoor.myshopify.com`. Requests from any other site are refused.

## 4. Add the section to Shopify

1. Online Store > Themes: duplicate the live theme and work on the copy.
2. Edit code > Sections > Add a new section named `dream-visualizer`. Replace everything in it with the contents of `shopify/sections/dream-visualizer.liquid`, then save.
3. Customize > homepage > Add section > Dream visualizer.
4. Paste the Vercel URL into API URL and the Turnstile site key into Turnstile site key.
5. Move it to where the current Visualize section is, then hide or remove the old one. Menu links to `#visualize` will scroll to the new section.
6. Test the whole flow in the theme preview, then publish the theme.

The section can also be added a second time with Show upload area turned off, for a gallery-only page.

## 5. Approve designs for the gallery

New designs are saved with `status: "pending"` and stay out of the gallery until approved.

1. In Atlas, open Browse Collections > `dream_visualizer` > `submissions`.
2. Filter with `{ status: "pending" }`.
3. Open `original.url` and `result.url` to look at both images.
4. Change `status` to `"approved"`, or `"rejected"` to hide it.

The gallery refreshes within about a minute.

Status values:

| Status | Meaning |
|---|---|
| `processing` | Being generated right now |
| `pending` | Done; waiting for approval |
| `approved` | Shown in the gallery |
| `rejected` | Hidden by you |
| `private` | Visitor didn't tick the gallery box; never shown |
| `failed` | Something broke; see the `error` field. Doesn't count toward the visitor's limit |

For testing, set `AUTO_APPROVE=true` so designs go straight to the gallery. Set it back to `false` before launch.

## Changing things

**Questions and answers:** edit `lib/options.js` and redeploy. The form updates automatically. Each answer has a `label` (what visitors see) and a `prompt` (what the AI is told).

**Lot size:** it's single choice, because a home has one lot. The client asked for multi-select; to change it, set `multi: true` and add `max` in `lib/options.js`.

**What every design includes:** `ALWAYS_INCLUDE` in `lib/prompt.js` is set to a composite deck, timber-frame pergola and railing, to match the prize. Confirm this with the client.

**Limits:** set these environment variables in Vercel.

| Variable | Default | What it limits |
|---|---|---|
| `MAX_PER_EMAIL` | 2 | Designs per email address, ever |
| `MAX_PER_IP_PER_DAY` | 5 | Designs per device or network per 24 hours |
| `MAX_PER_DAY` | 40 | Designs for the whole site per day (UTC). Keeps you inside the free AI allowance |

Check how many designs the free Cloudflare allowance actually covers per day: run `try:ai` a few times and look at usage in the Cloudflare dashboard. Then set `MAX_PER_DAY` below that number.

**AI provider:** everything model-specific is in `lib/ai.js`. To move to a paid model (Gemini, fal, OpenAI), rewrite `generateDesign()` so it takes the photo Blob and prompt and returns base64. If the new model accepts bigger input images, raise `AI_INPUT_MAX` too.

## What's stored

For each submission: first and last name, email, the three answers, gallery consent, Cloudinary links for both images, the prompt, the model, a salted hash of the IP address (never the raw IP), timestamps and status.

## Before launch

- **Vercel plan:** Vercel's free Hobby plan is for non-commercial use only. Move to Pro, or host the API somewhere whose free plan allows business use.
- **Privacy policy:** update it to cover photo uploads, AI processing, the gallery and how emails are used.
- **Email marketing:** emails are saved in MongoDB but not sent anywhere yet. Connecting Klaviyo or Shopify customers is a next step. Add a marketing opt-in checkbox first if the client wants one.
- **Moderation:** check pending designs regularly. Nothing reaches the gallery without approval unless `AUTO_APPROVE` is on.
- **Answers:** confirm the final answer lists and the always-included items with the client.

## Not built yet

- An admin page for approving designs (approval is in the Atlas dashboard for now)
- Emailing visitors their design
- Sending leads to Klaviyo or Shopify
