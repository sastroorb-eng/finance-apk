# Deployment Guide: Demo Mode → Live Supabase

Commands are for the **VS Code terminal on Windows (PowerShell)**, run from the `finance-app` folder.
They use the Supabase CLI v3 via `npx`, so nothing needs to be installed globally.

```powershell
cd "D:\apk manajemen uang\finance-app"
```

---

## 1. Create the Supabase project

1. Sign in at https://supabase.com/dashboard → **New project**.
2. Choose a name, a **database password** (save it, you'll need it once), and a region close to you (e.g. Singapore).
3. When it's ready, open **Project Settings → General** and copy the **Project ID** (the *project ref*, 20 lowercase letters).

## 2. Log in and link the CLI

```powershell
npx supabase login                               # opens the browser to authorize the CLI
npx supabase init                                # creates supabase/config.toml (keeps your existing files)
npx supabase link --project-ref <your-project-ref>  # asks for the database password
```

If `init` asks about IDE settings, answering **No** is fine.

## 3. Apply the database schema

```powershell
npx supabase db query --remote --file supabase/schema.sql
```

The CLI asks you to confirm because this changes a hosted database. Answer yes, or add `--yes`.

**No-CLI alternative:** Dashboard → **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.

Check that it worked:

```powershell
npx supabase db query --remote --read-only "select tablename from pg_tables where schemaname = 'public' order by 1"
```

You should see `ai_insights`, `ai_requests`, `categories`, `transactions`, `users`.

> `schema.sql` is safe to re-run. It won't change tables that already exist, though. If you applied an early
> version, drop those tables first: `drop table if exists public.ai_requests, public.ai_insights, public.transactions, public.categories, public.users cascade;`

## 4. Set the AI secrets

Pick **one** provider.

**Gemini** (key from https://aistudio.google.com/apikey):

```powershell
npx supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=<your-gemini-key>
```

**OpenAI** (key from https://platform.openai.com/api-keys):

```powershell
npx supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=<your-openai-key>
```

Optional tuning (defaults shown):

```powershell
npx supabase secrets set AI_COOLDOWN_SECONDS=60 AI_DAILY_LIMIT=10 AI_TIMEOUT_MS=25000
npx supabase secrets set AI_MODEL=gemini-2.5-flash     # or e.g. gpt-4o-mini for OpenAI
```

Check them with `npx supabase secrets list` (it shows names and hashes, never the values).
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. Don't set them yourself.

## 5. Deploy the Edge Function

```powershell
npx supabase functions deploy evaluate-finances --use-api
```

`--use-api` bundles the function on Supabase's servers, so **Docker is not required**.
JWT verification stays **on** (the default). Don't pass `--no-verify-jwt`, because the function needs the signed-in user.

Logs: Dashboard → **Edge Functions → evaluate-finances → Logs**.

## 6. Configure Auth

Dashboard → **Authentication → Sign In / Providers → Email**:

- **Development:** turn **Confirm email** off, so sign-up logs you in immediately.
- **Production:** keep it on. The app already shows "Check your email to confirm your account".

## 7. Point the app at Supabase (leave Demo Mode)

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Fill `.env` with the values from Dashboard → **Project Settings → API** (or **API Keys**):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key, or the sb_publishable_... key>
```

- Use **only** the anon / publishable key. **Never** put the `service_role` / secret key or any AI key in `.env`.
  Every `EXPO_PUBLIC_*` value is bundled into the app, and anyone with the app can read it.
- `.env` is already in `.gitignore`.

Restart Metro with a cleared cache, so the new variables are picked up:

```powershell
npx expo start -c
```

Scan the QR code with Expo Go. Instead of the Demo dashboard you'll now see **Sign In / Sign Up**.
That's how you can tell you're live. `isSupabaseConfigured` in `src/lib/supabase.js` is `true` once both variables are set.

**Back to Demo Mode:** rename or delete `.env` and run `npx expo start -c` again.

## 8. Smoke test (about 5 minutes)

| Step | Expected |
|---|---|
| Sign up with a new email | Dashboard opens with "Hello, <name>" |
| Tap **🏷 (Manage categories)** | 12 default categories appear (4 income, 8 expense) |
| Tap **+**, add an expense | Totals, chart and Recent list update |
| **See all** → search, change month, filter by type/category | List filters live, and the totals row follows the filters |
| Delete a transaction (trash icon → Delete) | It disappears, and the Dashboard totals update when you go back |
| **Refresh Analysis** | Score + 3 tips within ~10 s |
| Tap **Refresh Analysis** again right away | Button reads "Refresh in 5xs", with a cooldown message |
| Dashboard → Table Editor → `ai_insights` | One row per successful analysis |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Still in Demo Mode after creating `.env` | Variable names must start with `EXPO_PUBLIC_`. Restart with `npx expo start -c` |
| `Invalid API key` on sign-in | Wrong key in `.env`, or it has quotes or spaces around it |
| Phone can't reach the dev server | `npx expo start --tunnel` |
| AI card: "The AI service is not configured" | The secret is missing or misspelled. Run `npx supabase secrets list`, then redeploy |
| AI card: "AI service is busy / quota used up" | The provider returned 429. Wait, or check billing and quota with your provider |
| `new row violates row-level security policy` | You're not signed in, or the schema wasn't applied. Re-run step 3 |
| Edge Function returns 401 | Session expired. Sign out and back in |
| `functions deploy` mentions Docker | Add `--use-api` |
