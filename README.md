# Money Manager â€” Expo + Supabase + AI

A lightweight personal finance app for **Expo Go** (no native builds).

## Architecture & data flow

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   supabase-js (anon key + user JWT)   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  React Native (Expo) â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶ â”‚ Supabase                â”‚
â”‚  App.js              â”‚   Auth Â· select/insert (RLS enforced)  â”‚  Auth + PostgreSQL      â”‚
â”‚  screens/components  â”‚                                        â”‚  users, categories,     â”‚
â”‚  services/ (data)    â”‚ â”€â”€ functions.invoke('evaluate-finances')â”‚  transactions,          â”‚
â”‚  utils/finance.js    â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶ â”‚  ai_insights            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                        â”‚  Edge Function (Deno) â”€â”€â”¼â”€â”€â–¶ Gemini / OpenAI
          â–²                                                     â”‚   1. read month's txs   â”‚
          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ { spending_score, analysis, tips } â”€â”€â”€â”€â”€â”‚   2. prompt LLM (JSON)  â”‚
                                                                â”‚   3. save ai_insights   â”‚
                                                                â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

The AI API key is stored **only** in Supabase secrets. The app never sees it.

## Project layout

```
App.js                          auth gate â†’ AuthScreen / DashboardScreen
src/lib/supabase.js             Supabase client (AsyncStorage session)
src/services/financeService.js  all DB + Edge Function calls (with Demo Mode fallback)
src/utils/finance.js            income / expenses / net / savings-rate helpers
src/screens/                    AuthScreen, DashboardScreen
src/components/                 SummaryCard, TransactionItem, AIReviewCard, AddTransactionModal
supabase/schema.sql             tables, RLS, signup trigger (default categories)
supabase/functions/evaluate-finances/index.ts   AI evaluator (system prompt lives here)
```

## 1. Run it right now (Demo Mode)

With no `.env`, the app runs with sample data so you can see the UI immediately:

```bash
cd finance-app
npm install
# Already in package.json. Only needed if you set the project up from scratch:
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill \
  lucide-react-native react-native-svg react-native-safe-area-context @react-native-community/datetimepicker
npx expo start
```

All of these packages are included in Expo Go, so no development build is needed.

1. Install **Expo Go** on your phone (Play Store / App Store).
2. Put the phone and PC on the **same Wi-Fi**.
3. Android: open Expo Go and scan the QR code from the VS Code terminal. iOS: scan it with the Camera app.
4. Edit any file and save. Hot Reload updates the phone right away.

If the phone can't connect (school, office, or public Wi-Fi), run `npx expo start --tunnel`.
Other dev-server keys: `r` reloads, `j` opens the debugger, `shift+m` opens more tools.

## 2. Connect Supabase

Full step-by-step instructions (CLI commands, secrets, smoke test, troubleshooting): **[DEPLOYMENT.md](DEPLOYMENT.md)**. Short version:

1. Create a project at https://supabase.com.
2. **SQL Editor â†’ New query â†’** paste `supabase/schema.sql` â†’ **Run**.
3. Copy `.env.example` to `.env` and fill in the values from **Project Settings â†’ API**:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. Restart with `npx expo start -c`. The app now shows Sign In / Sign Up.
   For quick testing you can turn off **Authentication â†’ Providers â†’ Email â†’ Confirm email**.

## 3. Deploy the AI evaluator (Edge Function)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=<key>
#   or: npx supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=<key>
#   optional: AI_MODEL=<model-name>   (defaults: gemini-2.5-flash / gpt-4o-mini)
npx supabase functions deploy evaluate-finances
```

Tap **Refresh Analysis** in the app. The function returns:

```json
{ "spending_score": 72, "analysis": "â€¦", "tips": ["â€¦", "â€¦", "â€¦"], "period": "2026-11", "created_at": "â€¦" }
```

It also stores the result in `ai_insights` (`suggestions` = `{ analysis, tips }`).

### Rate limiting & errors

- **Cooldown:** 60 s between requests per user. **Daily cap:** 10 successful requests in any 24 h window. Failed requests don't count toward the cap.
  To change these: `npx supabase secrets set AI_COOLDOWN_SECONDS=120 AI_DAILY_LIMIT=5`.
  The limits are enforced atomically in Postgres (`claim_ai_request`), so double-taps can't get around them.
- Every error comes back as `{ error, code, retry_after, insight }` with an HTTP status code. `insight` is the last saved analysis, so the card keeps showing it.
  Codes: `COOLDOWN`, `DAILY_LIMIT`, `AI_QUOTA` (provider 429 or quota used up), `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, `NO_TRANSACTIONS`, `UNAUTHORIZED`, `BAD_REQUEST`, `SERVER_ERROR`.
- The app shows the message and counts down on the button ("Refresh in 42s").

### Schema notes

- `ai_insights` and `ai_requests` are **read-only** for users. Only the Edge Function (service role) writes them.
- A transaction can only use the user's own category, and the category type must match (no "expense" under "Salary").
- Deleting a category keeps its transactions and sets `category_id` to NULL.
- `schema.sql` is safe to re-run. Re-running it on an older version of the schema updates the policies and functions, but it does **not** change tables that already exist. If you ran the first version, drop the 4 tables first, or start a fresh project.

## Useful commands

```bash
npx expo install <pkg>   # always use this to add packages (picks SDK-compatible versions)
npx expo-doctor          # check dependency health
```
