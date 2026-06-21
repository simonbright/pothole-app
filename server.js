import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { handlePhotoReview } from './api/photo-review.js';
import { handlePhotoUpload } from './api/photo-upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const API_ONLY = process.env.API_ONLY === '1' || process.env.API_ONLY === 'true';

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: API_ONLY ? 'api' : 'full' });
});

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/api/photo-review', async (req, res) => {
  const result = await handlePhotoReview(req);
  res.status(result.status).json(result.body);
});

app.post('/api/photo-review', async (req, res) => {
  const result = await handlePhotoReview(req);
  res.status(result.status).json(result.body);
});

app.post('/api/photo-upload', upload.single('file'), async (req, res) => {
  const result = await handlePhotoUpload(req.file, req.body?.potholeId);
  res.status(result.status).json(result.body);
});

// Legacy Netlify function paths (redirect)
app.all('/.netlify/functions/photo-review', async (req, res) => {
  req.query = { ...req.query, ...req.body, action: req.body?.action || req.query.action };
  const result = await handlePhotoReview(req);
  res.status(result.status).json(result.body);
});

app.post('/.netlify/functions/photo-upload', upload.single('file'), async (req, res) => {
  const result = await handlePhotoUpload(req.file, req.body?.potholeId);
  res.status(result.status).json(result.body);
});

if (!API_ONLY) {
  app.get('/favicon.ico', (_req, res) => {
    res.redirect(301, '/favicon.svg');
  });

  app.use(express.static(__dirname, { index: 'index.html' }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(__dirname, 'index.html'));
  });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Pothole app listening on port ${port}`);
});
