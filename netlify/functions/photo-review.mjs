const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cfhuqcpojontkwhpkzyn.supabase.co';
const PHOTO_BUCKET = 'pothole-photos';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.PHOTO_REVIEW_SECRET;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Review-Secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...adminHeaders(), ...options.headers },
  });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return { response, body };
}

async function signedPhotoUrl(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PHOTO_BUCKET}/${encoded}`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || body?.error || 'Could not sign URL');
  const signed = body.signedURL || body.signedUrl || body.url;
  if (!signed) throw new Error('No signed URL returned');
  if (signed.startsWith('http')) return signed;
  if (signed.startsWith('/object/sign/')) return `${SUPABASE_URL}/storage/v1${signed}`;
  return `${SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

async function deletePhoto(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encoded}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}

async function getPothole(id) {
  const { response, body } = await rest(
    `potholes?id=eq.${encodeURIComponent(id)}&select=id,address,created_at,photo_path,photo_url,photo_status&limit=1`
  );
  if (!response.ok) throw new Error(body?.message || 'Could not load pothole');
  return Array.isArray(body) ? body[0] : null;
}

function isApproved(row) {
  if (!row) return false;
  if (row.photo_status === 'approved') return !!(row.photo_path || row.photo_url);
  if (!row.photo_status && row.photo_url) return true;
  return false;
}

function photoPath(row) {
  if (row.photo_path) return row.photo_path;
  if (row.photo_url) {
    const m = row.photo_url.match(/pothole-photos\/(.+)$/);
    if (m) return m[1];
  }
  return null;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});

  if (!SERVICE_KEY) {
    return json(503, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured on Netlify.' });
  }

  let action;
  let id;
  let secret;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    action = url.searchParams.get('action');
    id = url.searchParams.get('id');
    secret = req.headers.get('x-review-secret') || url.searchParams.get('secret');
  } else if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch (_) {}
    action = body.action;
    id = body.id;
    secret = req.headers.get('x-review-secret') || body.secret;
  } else {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    if (action === 'url') {
      if (!id) return json(400, { error: 'Missing id' });
      const row = await getPothole(id);
      if (!isApproved(row)) return json(404, { error: 'Photo not available' });
      const path = photoPath(row);
      if (!path) return json(404, { error: 'No photo path' });
      const url = await signedPhotoUrl(path);
      return json(200, { url });
    }

    if (!ADMIN_SECRET) {
      return json(503, { error: 'PHOTO_REVIEW_SECRET not configured on Netlify.' });
    }
    if (secret !== ADMIN_SECRET) return json(401, { error: 'Invalid review password' });

    if (action === 'list') {
      const { response, body } = await rest(
        'potholes?photo_status=eq.pending&photo_path=not.is.null&select=id,address,created_at,photo_path&order=created_at.asc&limit=100'
      );
      if (!response.ok) return json(response.status, { error: body?.message || 'List failed' });

      const items = await Promise.all((body || []).map(async (row) => {
        let previewUrl = null;
        let previewError = null;
        try {
          previewUrl = await signedPhotoUrl(row.photo_path);
        } catch (err) {
          previewError = err.message || 'Preview failed';
        }
        return { ...row, previewUrl, previewError };
      }));

      return json(200, { items, count: items.length });
    }

    if (action === 'approve') {
      if (!id) return json(400, { error: 'Missing id' });
      const row = await getPothole(id);
      if (!row?.photo_path) return json(404, { error: 'No pending photo' });
      const { response, body } = await rest(`potholes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ photo_status: 'approved', photo_url: null }),
      });
      if (!response.ok) return json(response.status, { error: body?.message || 'Approve failed' });
      return json(200, { ok: true });
    }

    if (action === 'reject') {
      if (!id) return json(400, { error: 'Missing id' });
      const row = await getPothole(id);
      const path = photoPath(row);
      if (path) await deletePhoto(path);
      const { response, body } = await rest(`potholes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ photo_status: 'rejected', photo_path: null, photo_url: null }),
      });
      if (!response.ok) return json(response.status, { error: body?.message || 'Reject failed' });
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  } catch (err) {
    return json(500, { error: err.message || 'Server error' });
  }
};
