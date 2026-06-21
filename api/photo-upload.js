const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cfhuqcpojontkwhpkzyn.supabase.co';
const PHOTO_BUCKET = 'pothole-photos';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

export async function handlePhotoUpload(file, potholeId) {
  if (!SERVICE_KEY) {
    return { status: 503, body: { error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' } };
  }
  if (!file?.buffer?.length) {
    return { status: 400, body: { error: 'Missing photo file' } };
  }
  if (!potholeId || !/^\d+$/.test(String(potholeId))) {
    return { status: 400, body: { error: 'Missing pothole id' } };
  }
  if (file.buffer.length > 5 * 1024 * 1024) {
    return { status: 400, body: { error: 'Photo too large (max 5 MB)' } };
  }

  try {
    await ensureBucket();

    const path = `${potholeId}/${Date.now()}.jpg`;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encoded}`, {
      method: 'POST',
      headers: {
        ...adminHeaders(file.mimetype || 'image/jpeg'),
        'x-upsert': 'true',
      },
      body: file.buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      return { status: uploadRes.status, body: { error: err?.message || err?.error || 'Storage upload failed' } };
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
      return { status: patchRes.status, body: { error: patchBody?.message || 'Could not save photo to report' } };
    }
    if (!Array.isArray(patchBody) || !patchBody.length) {
      return { status: 404, body: { error: 'Pothole not found' } };
    }

    return { status: 200, body: { path, status: 'pending' } };
  } catch (err) {
    return { status: 500, body: { error: err.message || 'Upload failed' } };
  }
}
