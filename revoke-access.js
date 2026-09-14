const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WEBHOOK_SECRET = String(process.env.ACCESS_ISSUE_WEBHOOK_SECRET || '');

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  if (WEBHOOK_SECRET && String(req.headers['x-access-issue-secret'] || '') !== WEBHOOK_SECRET) return res.status(401).json({ ok: false, message: 'Unauthorized.' });
  const code = String(req.body?.code || '').trim().toUpperCase();
  const purchaseId = String(req.body?.purchase_id || req.body?.order_id || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!code && !purchaseId && !email) return res.status(400).json({ ok: false, message: 'Code, payment_id, or email is required.' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ ok: false, unavailable: true, message: 'Access database is not connected yet.' });
  try {
    const filter = code
      ? `access_code=eq.${encodeURIComponent(code)}`
      : purchaseId
        ? `payment_id=eq.${encodeURIComponent(purchaseId)}`
        : `email=eq.${encodeURIComponent(email)}`;
    const rows = await supabase(`customer_access?${filter}&active=eq.true`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false })
    });
    return res.status(200).json({ ok: true, revoked: Array.isArray(rows) ? rows.length : 0 });
  } catch (e) {
    console.error('revoke-access error:', e);
    return res.status(500).json({ ok: false, message: 'Could not revoke access.' });
  }
}
