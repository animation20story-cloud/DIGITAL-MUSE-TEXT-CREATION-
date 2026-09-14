// Safe owner-only test helper. Simulates a completed purchase without pretending a real payment occurred.
import issueAccess from './issue-access.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  const secret = String(process.env.ADMIN_ACCESS_CODE || '').trim();
  const supplied = String(req.headers['x-admin-test-secret'] || '');
  if (!secret || supplied !== secret) return res.status(401).json({ ok: false, message: 'Unauthorized test request.' });
  req.body = {
    email: req.body?.email,
    purchase_id: `TEST-${Date.now()}`,
    source: req.body?.source || 'test-purchase',
    prefix: req.body?.prefix || 'DMS04',
    product: req.body?.product || 'Text Creation Studio'
  };
  req.headers['x-access-issue-secret'] = process.env.ACCESS_ISSUE_WEBHOOK_SECRET || '';
  return issueAccess(req, res);
}
