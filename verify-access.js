const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error('Supabase request failed');
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, message: 'Missing code.' });

  const admin = String(process.env.ADMIN_ACCESS_CODE || '').trim().toUpperCase();
  if (admin && code === admin) return res.status(200).json({ ok: true, role: 'admin' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, unavailable: true, message: 'Access database is not connected yet.' });
  }

  try {
    const rows = await supabase(
      `customer_access?access_code=eq.${encodeURIComponent(code)}&active=eq.true&select=id,email,product,active&limit=1`
    );
    if (Array.isArray(rows) && rows[0]) {
      return res.status(200).json({
        ok: true,
        role: 'customer',
        email: rows[0].email || '',
        product: rows[0].product || 'Text Creation Studio'
      });
    }
    return res.status(401).json({ ok: false, message: 'That code is not associated with active access.' });
  } catch (error) {
    console.error('verify-access error:', error);
    return res.status(503).json({ ok: false, unavailable: true, message: 'Access verification is temporarily unavailable.' });
  }
}
