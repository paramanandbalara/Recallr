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

## WhatsApp messages

Users can get **interview reminders** (the evening before, from 18:00 India time, and about an hour before each
interview in the app's calendar) and the **question of the day** (about 09:00 India time) on WhatsApp. Both are
off until the user adds and verifies their number under **Account → Settings → WhatsApp** and turns them on.
Until WhatsApp is set up, nothing is sent: each message is only logged as *skipped*. Every message (sent, failed or
skipped) is listed in **Admin → WhatsApp**.

### 1. Get the token and phone number ID (Meta WhatsApp Cloud API)

1. In [Meta for Developers](https://developers.facebook.com/apps) create an app of type **Business** and add the
   **WhatsApp** product. Connect your Meta Business account (verify the business in Business Settings → Security
   Centre to message more than a few test numbers).
2. **WhatsApp → API setup → Add phone number:** add the business number that will send the messages (it can't be a
   number already used in the WhatsApp app) and verify it. Copy its **Phone number ID** (not the phone number itself).
3. **Business Settings → Users → System users → Add** a system user (Admin), then **Add assets**: your app (full
   control) and your WhatsApp account. **Generate new token** for the app with the permissions
   `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. This is the permanent token.
   (The temporary token on the API setup page stops working after 24 hours.)
4. In **Admin → Settings → WhatsApp** paste the **access token** and **phone number ID**, save, then press
   **Send a test message** and enter your own WhatsApp number. "Works" means Meta accepted it.

### 2. Create the three message templates (WhatsApp Manager → Message templates → Create template)

Meta only lets a business start a conversation with an approved template. Create these three, in the language set in
**Template language** (default `en`, "English"), with exactly these names (or change the names in Settings).
**Meta must approve each template** before it can be sent (usually minutes, sometimes a day); until then sending
fails with "template does not exist" or "not approved" in the log. Keep the variables in the middle of the text:
Meta rejects templates that start or end with a variable.

- **`interview_reminder`**, category **Utility**, body with 2 variables:

  > Hi! A reminder from Recallr: your interview "{{1}}" is {{2}}. Open Recallr a few minutes early to check your microphone and call audio. All the best!

  Sample values for the review: `{{1}}` = `Infosys technical round`, `{{2}}` = `tomorrow (Thu, 16 Oct, 10:30 am)`.
  Recallr fills {{1}} with the interview's title and {{2}} with "tomorrow (…)" the evening before, or
  "today at 10:30 am (in about 1 hour)" an hour before.

- **`daily_question`**, category **Utility** (Meta may move it to Marketing; that's fine, it still sends), body with 2 variables:

  > Your Recallr question of the day: {{1}} Answer it in 2 minutes and get AI feedback: {{2}} You can turn these messages off in your account settings.

  Sample values: `{{1}}` = `Tell me about a time you disagreed with a teammate.`, `{{2}}` = `https://your-domain/account/daily`.

- **`verify_code`**, category **Authentication**, with a **Copy code** button (WhatsApp writes the body itself:
  "*{{1}}* is your verification code."; tick "Add security recommendation" if you like, and set the code to expire
  in 10 minutes). Users get their 6-digit code with it when they add their number.

### How numbers are verified

Recallr never sends reminders or questions to a number the user hasn't proven is theirs. When a user types their
number, Recallr sends a 6-digit code to it with the `verify_code` template; the number is saved on the account only
after they type that code on the website (within 10 minutes; a few tries per hour). Without an approved
authentication template, nobody can add a number, so no reminders or daily questions go out: there is deliberately
no fallback that skips verification (showing a code on screen doesn't prove anyone owns the number).

## Daily practice and practising with a friend

- **Question of the day.** Each day at 00:05 India time one question is chosen for everyone: a published question
  from the **Question bank** not used in the last 90 days, rotating through the categories. With nothing published,
  the AI writes one. Users answer it in the app (on the empty conversation screen) or on the website
  (**Account → Daily practice**) and get a score with feedback; that AI use counts on their plan. The streak counts
  days with a daily answer, a mock interview or a practice with a friend.
- **Practise with a friend.** In the app, Display menu → **Practise with a friend**. One person hosts and shares a
  6-character code; the friend joins in the app, or on the website (`/practice/join/CODE`) as the interviewer. They
  talk on any call app; Recallr shows the questions, the candidate's answer as it is said, and an AI score counted
  on the **candidate's** plan (tokens, and listening time for spoken answers). Rooms last 3 hours and are deleted a day later.

## Common requests

| The user says | Do this |
|---------------|---------|
| "I paid but the app still asks for a plan" | Payments → Waiting: approve it. Online payment missing? Check the Razorpay Dashboard and the webhook, then record it on the user. |
| "I forgot my password" | Users → the user → Reset password, and email them the new one. |
| "My time ran out mid-interview" | Give a small free pack, or point them to a top-up. |
| "Delete my account" | Not built in yet: delete the user's row in the database (their packs, payments and usage go with it). |
