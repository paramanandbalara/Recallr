# Running Recallr: admin guide

Everything is in the **Admin** panel on the website (sign in with the admin account → **Admin** in the header).

## Dashboard

Revenue in the last 30 days, users (new this week), users with an active plan (paying vs. trial or given),
offline payments waiting for you, and listening / AI used in the last 30 days. Offline payments to check are listed
right there, with Approve and Reject.

## Settings

**Settings** holds the keys and details the business runs on, stored encrypted in the database:

- **AI providers:** Groq, OpenAI and Claude keys (at least one), and whether the fastest answers or a fixed order. Use **Test** after saving.
- **Razorpay:** key ID, key secret and webhook secret. Without them only offline payment is offered.
- **Offline payments:** the UPI / bank details users see.
- **Website:** business name, support email, Windows and macOS download links.
- **App versions:** the latest and minimum desktop versions, what's new, and the **Update files address** (the folder
  with the installers and `latest.yml` files). With the address set, apps download and install updates themselves;
  see [DEPLOYMENT.md](DEPLOYMENT.md#updates-that-install-inside-the-app).

Changes apply within seconds. Each field shows where its value comes from (Saved here, From .env, Default);
**Remove** drops the saved value.

## Activity

**Activity** lists everything admins did: payments approved or rejected, users blocked, plans given, packs and plans
edited, settings changed (which ones, never the secret values). Filter by type, newest first.

## Approving offline payments

When a user pays by UPI or bank transfer, they enter the reference on the website. It shows under
**Payments → Waiting**.

1. Find the payment in your UPI app or bank statement: same amount, same reference.
2. Found it → **Approve**. The plan starts right away; the user clicks "I've paid, check again" in the app.
3. Not found → **Reject**, with a short reason (the user sees it on their account page).

Approving twice never gives the plan twice.

Paid some other way (cash, a transfer without a claim)? Open the user under **Users** → **Give a plan** →
"Record a payment". It counts in revenue and the plan starts straight away.

## Plans and the free trial

**Plans** lists every plan with how many times it's been sold.

- **Price, days, listening minutes, AI tokens.** Leave minutes or tokens empty for unlimited. About 2,500 tokens is one
  answer; the form shows the estimate.
- **On sale.** Turn it off to hide a plan from the website. Packs already sold keep working.
- **Free trial.** Mark one plan as the trial and every new account gets it once, at sign-up. Only one plan can be the
  trial and it can't be bought. Turn "On sale" off on the trial plan to stop giving trials.
- Editing a plan changes it for new purchases only.

A sensible start (what the seed creates): trial 30 min / 100k tokens / 3 days; Starter ₹299 for 2 h / 7 days; Pro ₹799
for 10 h / 30 days; Top-up ₹199 for 3 h / 30 days.

## Users

Search by name or email. Open a user to:

- **Block / Unblock.** Blocked users are refused on their next request, in the app and on the website.
- **Make admin / Remove admin.**
- **Reset password.** Gives a temporary password, shown once; send it to the user and they change it under
  Account → Settings. This is how "forgot password" works (the guide tells users to email support).
- **Give a plan.** Free (goodwill, an extra trial, making up for a problem) or recording a payment.
- **Packs.** See what's used, and **Edit** to extend the end date or add minutes or tokens.
- **Payments and recent usage.** Every answer and transcription, with the model and amount.

## Refunds

Refund in the Razorpay Dashboard (online payments) or by UPI/bank (offline), then open the user and edit the pack:
set its end date to yesterday so it stops right away.

## Common requests

| The user says | Do this |
|---------------|---------|
| "I paid but the app still asks for a plan" | Payments → Waiting: approve it. Online payment missing? Check the Razorpay Dashboard and the webhook, then record it on the user. |
| "I forgot my password" | Users → the user → Reset password, and email them the new one. |
| "My time ran out mid-interview" | Give a small free pack, or point them to a top-up. |
| "Delete my account" | Not built in yet: delete the user's row in the database (their packs, payments and usage go with it). |
