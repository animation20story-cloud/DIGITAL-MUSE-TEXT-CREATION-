import crypto from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WEBHOOK_SECRET = String(process.env.ACCESS_ISSUE_WEBHOOK_SECRET || '');
const ALLOWED_PREFIXES = new Set(['DMS12', 'DMS04', 'DMS02']);

function json(res, status, body) { return res.status(status).json(body); }
function makeCode(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let middle = '';
  for (let i = 0; i < 5; i++) middle += chars[crypto.randomInt(chars.length)];
  return `${prefix}-${middle}-W`;
}
async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase environment variables are not configured.');
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (options.method === 'POST' || options.method === 'PATCH') headers.Prefer = 'return=representation';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'Method not allowed.' });
  if (WEBHOOK_SECRET && String(req.headers['x-access-issue-secret'] || '') !== WEBHOOK_SECRET) return json(res, 401, { ok: false, message: 'Unauthorized.' });

  const body = req.body || {};
  const email = String(body.email || body.customer_email || '').trim().toLowerCase();
  const purchaseId = String(body.purchase_id || body.order_id || body.session_id || '').trim();
  const prefix = String(body.prefix || body.access_prefix || 'DMS04').trim().toUpperCase();
  const source = String(body.source || 'purchase').trim();
  const product = String(body.product || 'Text Creation Studio').trim();

  if (!email) return json(res, 400, { ok: false, message: 'Customer email is required.' });
  if (!ALLOWED_PREFIXES.has(prefix)) return json(res, 400, { ok: false, message: 'Invalid access-code prefix.' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { ok: false, unavailable: true, message: 'Access database is not connected yet.' });

  try {
    if (purchaseId) {
      const existing = await supabase(`customer_access?payment_id=eq.${encodeURIComponent(purchaseId)}&active=eq.true&select=access_code,email,code_prefix&limit=1`);
      if (Array.isArray(existing) && existing[0]) {
        return json(res, 200, { ok: true, reused: true, code: existing[0].access_code, email: existing[0].email, prefix: existing[0].code_prefix || prefix });
      }
    }

    const existingEmail = await supabase(`customer_access?email=eq.${encodeURIComponent(email)}&active=eq.true&select=access_code,email,code_prefix&limit=1`);
    if (Array.isArray(existingEmail) && existingEmail[0]) {
      return json(res, 200, { ok: true, reused: true, code: existingEmail[0].access_code, email, prefix: existingEmail[0].code_prefix || prefix });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode(prefix);
      try {
        const rows = await supabase('customer_access', {
          method: 'POST',
          body: JSON.stringify({
            access_code: code,
            code_prefix: prefix,
            email,
            product,
            purchase_source: source,
            payment_id: purchaseId || null,
            active: true
          })
        });
        return json(res, 200, { ok: true, created: true, code: rows?.[0]?.access_code || code, email, prefix });
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
  } catch (error) {
    console.error('issue-access error:', error);
    return json(res, 500, { ok: false, message: 'Could not create access code.' });
  }
}
