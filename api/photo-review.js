const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cfhuqcpojontkwhpkzyn.supabase.co';
const PHOTO_BUCKET = 'pothole-photos';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.PHOTO_REVIEW_SECRET;

function adminHeaders(contentType) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...adminHeaders('application/json'), ...options.headers },
  });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return { response, body };
}

export async function signedPhotoUrl(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PHOTO_BUCKET}/${encoded}`, {
    method: 'POST',
    headers: adminHeaders('application/json'),
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

export async function handlePhotoReview(req) {
  if (!SERVICE_KEY) {
    return { status: 503, body: { error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' } };
  }

  const action = req.method === 'GET' ? req.query.action : req.body?.action;
  const id = req.method === 'GET' ? req.query.id : req.body?.id;
  const secret = req.headers['x-review-secret'] || req.query.secret || req.body?.secret;

  try {
    if (action === 'url') {
      if (!id) return { status: 400, body: { error: 'Missing id' } };
      const row = await getPothole(id);
      if (!isApproved(row)) return { status: 404, body: { error: 'Photo not available' } };
      const path = photoPath(row);
      if (!path) return { status: 404, body: { error: 'No photo path' } };
      const url = await signedPhotoUrl(path);
      return { status: 200, body: { url } };
    }

    if (!ADMIN_SECRET) {
      return { status: 503, body: { error: 'PHOTO_REVIEW_SECRET not configured.' } };
    }
    if (secret !== ADMIN_SECRET) {
      return { status: 401, body: { error: 'Invalid review password' } };
    }

    if (action === 'list') {
      const { response, body } = await rest(
        'potholes?photo_status=eq.pending&photo_path=not.is.null&select=id,address,created_at,photo_path&order=created_at.asc&limit=100'
      );
      if (!response.ok) return { status: response.status, body: { error: body?.message || 'List failed' } };

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

      return { status: 200, body: { items, count: items.length } };
    }

    if (action === 'approve') {
      if (!id) return { status: 400, body: { error: 'Missing id' } };
      const row = await getPothole(id);
      if (!row?.photo_path) return { status: 404, body: { error: 'No pending photo' } };
      const { response, body } = await rest(`potholes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ photo_status: 'approved', photo_url: null }),
      });
      if (!response.ok) return { status: response.status, body: { error: body?.message || 'Approve failed' } };
      return { status: 200, body: { ok: true } };
    }

    if (action === 'reject') {
      if (!id) return { status: 400, body: { error: 'Missing id' } };
      const row = await getPothole(id);
      const path = photoPath(row);
      if (path) await deletePhoto(path);
      const { response, body } = await rest(`potholes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ photo_status: 'rejected', photo_path: null, photo_url: null }),
      });
      if (!response.ok) return { status: response.status, body: { error: body?.message || 'Reject failed' } };
      return { status: 200, body: { ok: true } };
    }

    return { status: 400, body: { error: 'Unknown action' } };
  } catch (err) {
    return { status: 500, body: { error: err.message || 'Server error' } };
  }
}
