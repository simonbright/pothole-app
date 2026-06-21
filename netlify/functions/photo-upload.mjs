const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cfhuqcpojontkwhpkzyn.supabase.co';
const PHOTO_BUCKET = 'pothole-photos';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function adminHeaders(contentType) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

async function ensureBucket() {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: adminHeaders('application/json'),
    body: JSON.stringify({
      id: PHOTO_BUCKET,
      name: PHOTO_BUCKET,
      public: false,
      file_size_limit: 5242880,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  if (response.status === 409 || /already exists/i.test(body?.message || '')) return;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});

  if (!SERVICE_KEY) {
    return json(503, { error: 'SUPABASE_SERVICE_ROLE_KEY not configured on Netlify.' });
  }

  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const form = await req.formData();
    const file = form.get('file');
    const potholeId = String(form.get('potholeId') || '').trim();

    if (!file || typeof file.arrayBuffer !== 'function') {
      return json(400, { error: 'Missing photo file' });
    }
    if (!potholeId || !/^\d+$/.test(potholeId)) {
      return json(400, { error: 'Missing pothole id' });
    }

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) return json(400, { error: 'Empty photo file' });
    if (bytes.byteLength > 5 * 1024 * 1024) return json(400, { error: 'Photo too large (max 5 MB)' });

    await ensureBucket();

    const path = `${potholeId}/${Date.now()}.jpg`;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encoded}`, {
      method: 'POST',
      headers: {
        ...adminHeaders(file.type || 'image/jpeg'),
        'x-upsert': 'true',
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      return json(uploadRes.status, { error: err?.message || err?.error || 'Storage upload failed' });
    }

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/potholes?id=eq.${encodeURIComponent(potholeId)}`, {
      method: 'PATCH',
      headers: {
        ...adminHeaders('application/json'),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        photo_path: path,
        photo_status: 'pending',
        photo_url: null,
      }),
    });

    const patchBody = await patchRes.json().catch(() => null);
    if (!patchRes.ok) {
      return json(patchRes.status, { error: patchBody?.message || 'Could not save photo to report' });
    }
    if (!Array.isArray(patchBody) || !patchBody.length) {
      return json(404, { error: 'Pothole not found' });
    }

    return json(200, { path, status: 'pending' });
  } catch (err) {
    return json(500, { error: err.message || 'Upload failed' });
  }
};
