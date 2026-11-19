// Supabase Edge Function: evaluate-finances
//
// POST { "period": "YYYY-MM" }  (Authorization: Bearer <user JWT>, sent automatically by supabase-js)
//
// Success 200: { spending_score, analysis, tips, period, created_at }
// Error  4xx/5xx: { error, code, retry_after?, insight? }
//   code: UNAUTHORIZED | BAD_REQUEST | COOLDOWN | DAILY_LIMIT | AI_QUOTA | AI_TIMEOUT | AI_INVALID_RESPONSE
//         | AI_UNAVAILABLE | NO_TRANSACTIONS | SERVER_ERROR
//   insight: the latest saved analysis for the period (if any), so the app can keep showing something.
//
// Secrets:  AI_PROVIDER=gemini|openai, GEMINI_API_KEY / OPENAI_API_KEY
// Optional: AI_MODEL, AI_COOLDOWN_SECONDS (default 60), AI_DAILY_LIMIT (default 10), AI_TIMEOUT_MS (default 25000)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const COOLDOWN_SECONDS = Number(Deno.env.get('AI_COOLDOWN_SECONDS') ?? 60);
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 10);
const TIMEOUT_MS = Number(Deno.env.get('AI_TIMEOUT_MS') ?? 25000);
const MAX_TRANSACTIONS = 500; // keeps the prompt within a sensible token budget

const SYSTEM_PROMPT = `You are a certified personal financial advisor.
You receive ONE month of a user's transactions as JSON plus pre-computed totals.

Evaluate the user's financial health for that month, considering:
- Savings rate (net balance / income). >= 20% is healthy, < 0% is critical.
- Expense concentration: which categories dominate spending.
- Discretionary vs. essential spending (e.g. Entertainment/Shopping vs. Bills/Transport/Health).
- Frequency of small, impulsive purchases.

Scoring guide for spending_score (integer 1-100):
- 80-100: saves >= 20% of income, spending is controlled and balanced.
- 60-79 : positive savings, some categories could be trimmed.
- 40-59 : low savings (0-10%), noticeable discretionary overspending.
- 1-39  : spending exceeds income or no income recorded.

Respond with ONLY a valid JSON object, no markdown, in exactly this shape:
{
  "spending_score": <integer 1-100>,
  "analysis": "<2-3 sentence overview of the spending behavior, referencing real numbers>",
  "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]
}
Each tip must be short (max 20 words), specific to THIS data, and actionable.
Use the same currency values as the input. Do not invent transactions.`;

type Tx = { amount: number; type: 'income' | 'expense'; date: string; description: string | null; category: string };
type Insight = { spending_score: number; analysis: string; tips: string[] };

class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/** Seconds from a Retry-After header (seconds or HTTP date). */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(1, Math.ceil(secs));
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - Date.now()) / 1000)) : undefined;
}

/** Maps a non-OK AI provider response to a clean AppError. Never leaks the raw provider body to the client. */
async function providerError(provider: string, res: Response): Promise<AppError> {
  const body = await res.text().catch(() => '');
  console.error(`[${provider}] HTTP ${res.status}: ${body.slice(0, 500)}`);
  const retryAfter = parseRetryAfter(res.headers.get('retry-after'));

  if (res.status === 429 || /RESOURCE_EXHAUSTED|insufficient_quota|rate.?limit/i.test(body)) {
    const quotaGone = /insufficient_quota|billing|exceeded your current quota/i.test(body);
    return new AppError(
      429,
      'AI_QUOTA',
      quotaGone
        ? 'The AI service quota has been used up. Please try again later.'
        : 'The AI service is busy right now. Please try again in a moment.',
      retryAfter ?? 60,
    );
  }
  if (res.status === 401 || res.status === 403) {
    return new AppError(503, 'AI_UNAVAILABLE', 'The AI service is not configured correctly.');
  }
  if (res.status === 400 && /SAFETY|content_filter/i.test(body)) {
    return new AppError(422, 'AI_INVALID_RESPONSE', 'The AI could not analyze this data.');
  }
  return new AppError(503, 'AI_UNAVAILABLE', 'The AI service is temporarily unavailable.', retryAfter ?? 30);
}

/** fetch with a timeout; one automatic retry on 5xx or network errors (not on 429). */
async function fetchAI(provider: string, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return res;
      if (res.status >= 500 && attempt === 0) {
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw await providerError(provider, res);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const isTimeout = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
      if (attempt === 0 && !isTimeout) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      console.error(`[${provider}] fetch failed:`, err);
      throw isTimeout
        ? new AppError(504, 'AI_TIMEOUT', 'The AI took too long to respond. Please try again.')
        : new AppError(503, 'AI_UNAVAILABLE', 'Could not reach the AI service.', 30);
    }
  }
  throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is temporarily unavailable.', 30);
}

async function callOpenAI(userContent: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is not configured.');
  const res = await fetchAI('openai', 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an empty response.');
  return text;
}

async function callGemini(userContent: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is not configured.');
  const model = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash';
  const res = await fetchAI(
    'gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    },
  );
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an empty response.');
  return text;
}

/** Parses and normalizes the model output. Throws AI_INVALID_RESPONSE if it is unusable. */
function sanitize(raw: string): Insight {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    console.error('Unparseable AI output:', raw.slice(0, 500));
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an invalid response. Please try again.');
  }
  const score = Math.round(Number(parsed?.spending_score));
  const analysis = typeof parsed?.analysis === 'string' ? parsed.analysis.trim() : '';
  const tips = Array.isArray(parsed?.tips)
    ? parsed.tips.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()).slice(0, 3)
    : [];
  if (!Number.isFinite(score) || !analysis || tips.length === 0) {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned an incomplete response. Please try again.');
  }
  return { spending_score: Math.min(100, Math.max(1, score)), analysis: analysis.slice(0, 1000), tips };
}

async function latestInsight(admin: SupabaseClient, userId: string, period: string) {
  const { data } = await admin
    .from('ai_insights')
    .select('spending_score, suggestions, created_at')
    .eq('user_id', userId)
    .eq('period', period)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { spending_score: data.spending_score, ...data.suggestions, period, created_at: data.created_at } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'BAD_REQUEST' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  let period = '';
  let requestId: number | null = null;

  try {
    // ---- 1. Authenticate the caller ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in again.');
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData?.user) throw new AppError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    userId = authData.user.id;

    // ---- 2. Validate input ----
    const body = await req.json().catch(() => ({}));
    period = String(body?.period ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(400, 'BAD_REQUEST', 'period must be in YYYY-MM format.');

    // ---- 3. Rate limit (atomic cooldown + daily cap in Postgres) ----
    const { data: claim, error: claimError } = await admin
      .rpc('claim_ai_request', { p_user_id: userId, p_cooldown_seconds: COOLDOWN_SECONDS, p_daily_limit: DAILY_LIMIT })
      .single();
    if (claimError) throw claimError;
    const c = claim as { allowed: boolean; reason: string; retry_after: number; request_id: number };
    if (!c.allowed) {
      throw c.reason === 'cooldown'
        ? new AppError(429, 'COOLDOWN', `Please wait ${c.retry_after}s before refreshing again.`, c.retry_after)
        : new AppError(429, 'DAILY_LIMIT', `Daily limit of ${DAILY_LIMIT} analyses reached. Try again later.`, c.retry_after);
    }
    requestId = c.request_id;

    // ---- 4. Load the month's transactions (scoped to the user explicitly) ----
    const [y, m] = period.split('-').map(Number);
    const start = `${period}-01`;
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // first day of next month

    const { data: rows, error } = await admin
      .from('transactions')
      .select('amount, type, date, description, categories(name)')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', end)
      .order('date')
      .limit(MAX_TRANSACTIONS);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      throw new AppError(422, 'NO_TRANSACTIONS', 'Add some transactions for this month before running an analysis.');
    }

    const transactions: Tx[] = rows.map((r: any) => ({
      amount: Number(r.amount),
      type: r.type,
      date: r.date,
      description: r.description,
      category: r.categories?.name ?? 'Uncategorized',
    }));

    let income = 0;
    let expenses = 0;
    for (const t of transactions) t.type === 'income' ? (income += t.amount) : (expenses += t.amount);
    const summary = {
      period,
      total_income: income,
      total_expenses: expenses,
      net_balance: income - expenses,
      savings_rate_pct: income > 0 ? Number((((income - expenses) / income) * 100).toFixed(1)) : 0,
      transaction_count: transactions.length,
    };

    // ---- 5. Call the AI ----
    const userContent = JSON.stringify({ summary, transactions });
    const provider = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();
    const raw = provider === 'openai' ? await callOpenAI(userContent) : await callGemini(userContent);
    const result = sanitize(raw);

    // ---- 6. Save & respond ----
    const { data: saved, error: insertError } = await admin
      .from('ai_insights')
      .insert({
        user_id: userId,
        period,
        spending_score: result.spending_score,
        suggestions: { analysis: result.analysis, tips: result.tips },
      })
      .select('created_at')
      .single();
    if (insertError) throw insertError;

    await admin.from('ai_requests').update({ status: 'success' }).eq('id', requestId);
    return json({ ...result, period, created_at: saved.created_at });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : (console.error('Unexpected error:', err),
          new AppError(500, 'SERVER_ERROR', 'Something went wrong. Please try again later.'));

    // A failed request doesn't count toward the daily cap (the cooldown still applies).
    if (requestId !== null) {
      await admin.from('ai_requests').update({ status: 'failed' }).eq('id', requestId);
    }

    // Send the last saved insight along, so the app can keep showing it.
    let insight = null;
    if (userId && period && appErr.code !== 'BAD_REQUEST') {
      insight = await latestInsight(admin, userId, period).catch(() => null);
    }

    return json(
      { error: appErr.message, code: appErr.code, retry_after: appErr.retryAfter ?? null, insight },
      appErr.status,
      appErr.retryAfter ? { 'Retry-After': String(appErr.retryAfter) } : {},
    );
  }
});
