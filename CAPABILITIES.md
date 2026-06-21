# Pothole Log — Capabilities & Overview

A mobile-first progressive web app for logging potholes with one tap. Built as a single static HTML file with Supabase for storage and Netlify for hosting.

**Production URL:** https://pothole-app.netlify.app  
**GitHub:** https://github.com/simonbright/pothole-app  
**Supabase project:** `cfhuqcpojontkwhpkzyn`

---

## What it does

Drivers (or passengers) hit a large **HIT!** button when they drive over a pothole. The app captures GPS, reverse-geocodes the address, shows a confirm screen, and saves the report to a shared database. Anyone can browse history, view all reports on a map, and contest incorrect entries.

---

## User interface

### Layout (mobile-first)

- **Bottom navigation:** Hit · Map · History
- **Top bar:** Day/night theme toggle · optional Email button
- **Safe-area support:** Works on iPhone notch and home indicator
- **Add to Home Screen:** Standalone PWA-style experience in Safari

### Hit tab

- Headline: **“Hit a Pothole? Tap Hit”**
- Giant red circular **HIT!** button (one-hand use)
- **📷 Snap photo report** — take a picture; location and time come from photo GPS metadata (EXIF)
- **Add photo to last report** — attach a photo to your most recent log (shown after first log)
- Status bar for GPS progress, success, and errors

### Photo reports

Two ways to use photos:

1. **New report from photo** — tap **Snap photo report**, take a picture. The app reads GPS + timestamp from the photo, shows the same confirm panel (adjust location if needed), then saves entry + photo.
2. **Attach to existing report** — after logging, use **Add photo to last report**, or open any entry in History/Map and tap **Add or change photo**.

Photos are compressed client-side, uploaded to Supabase Storage, and linked via `photo_url`. History shows a 📷 icon when a report has a photo.

**iPhone note:** Location must be enabled for the Camera app (Settings → Privacy → Location Services → Camera → While Using).

### Map tab

- Leaflet map with CARTO tiles (dark at night, voyager in day mode)
- All logged potholes shown as markers
- Tap a marker to open the contest/detail panel
- Refresh button to reload data

### History tab

- City count pills (e.g. **12 Toronto**)
- Scrollable table: When · City · Address · Coordinates · ±m · **📷** · **Cont.**
- **Cont.** column: amber badge with total contest count; contested rows have an amber left border
- Tap a row → switches to Map (flies to location) and opens contest panel
- Refresh button

---

## Logging a pothole (full flow)

1. **Tap HIT!** — triggers high-accuracy GPS (watch + poll, up to ~8s; reuses last fix for 90s on repeat taps).
2. **Reverse geocode** — OpenStreetMap Nominatim returns full address; city parsed client-side.
3. **Confirm panel** opens with:
   - Title: **Confirm location (or let it log itself)**
   - **2.5s auto-log countdown** — visible ring + timer; pauses while adjusting map
   - Large street address (e.g. `54 Russell Hill Road`) + neighbourhood/city line
   - Coordinates and GPS accuracy (±m)
   - **Adjust location** — opens draggable map pin; timer pauses; **Done adjusting** closes map and resumes countdown (does not reset to 2.5s)
   - **Cancel** — discards without logging
   - **Log pothole** — saves immediately
4. **Auto-log** — if timer hits zero: ring turns green for 0.5s, then logs and closes
5. Optional haptic feedback on supported devices

### GPS requirements

- **HTTPS required** on phone (use Netlify URL, not local `http://192.168.x.x`)
- Clear error if opened over insecure HTTP
- iPhone: allow location for Safari in Settings

---

## Contests

Tap any history row or map marker to open **Pothole report**:

| Action | Reason stored |
|--------|----------------|
| Totally wrong — not a pothole | `wrong` |
| Wrong location | `location` (opens fix map) |
| Fixed / not there anymore | `fixed` |

**Wrong location fix:**

- Draggable pin on map
- Updates pothole coordinates + address in Supabase
- Logs a `location` contest automatically

Contest counts show in the detail panel and in History **Cont.** column.

---

## Optional email

- Stored in `localStorage` only (`pothole_email`) — no login/password
- Attached to new pothole rows and contest rows when the DB column exists
- Can save or clear from the Email panel

---

## Theme

- **Day** and **Night** modes
- Persisted in `localStorage` (`pothole_theme`)
- Map tiles switch with theme (CARTO dark_all / voyager)

---

## Data stored per pothole

| Field | Description |
|-------|-------------|
| `latitude`, `longitude` | GPS coordinates |
| `accuracy` | GPS accuracy in metres |
| `address` | Full reverse-geocoded address |
| `city` | Parsed city (if column enabled) |
| `reporter_email` | Optional (if column enabled) |
| `photo_url` | Public URL to attached photo (if enabled) |
| `created_at` | Timestamp (from photo EXIF when reporting via camera) |

### Contests table

| Field | Description |
|-------|-------------|
| `pothole_id` | FK to potholes (cascade delete) |
| `reason` | `wrong` · `location` · `fixed` |
| `reporter_email` | Optional |
| `created_at` | Timestamp |

History hides rows with `address is null` (empty trial logs).

---

## Backend (Supabase)

- **REST API** with publishable (anon) key — no user auth required
- **Row Level Security:** public read, insert on potholes and contests; update on potholes (for location fixes)
- **No delete from the app** — clearing data requires SQL in Supabase dashboard
- **Schema detection:** `localStorage` cache (`pothole_schema`) skips optional columns if missing to avoid 400 errors

### SQL scripts (`supabase/`)

| File | Purpose |
|------|---------|
| `schema.sql` | Tables, columns, RLS policies — run once in SQL Editor |
| `photos.sql` | `photo_url` column + Supabase Storage bucket for photos |
| `cleanup-trials.sql` | Delete rows where `address is null` |
| `clear-all-data.sql` | Truncate all potholes and contests (fresh start) |
| `delete-yesterday.sql` | Delete logs from a specific date window |

---

## Local storage (device only)

| Key | Content |
|-----|---------|
| `pothole_email` | Optional reporter email |
| `pothole_theme` | `day` or `night` |
| `pothole_schema` | Which DB columns/features are available |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Single `index.html` (~2,400 lines) — HTML, CSS, vanilla JS |
| Maps | Leaflet 1.9 + CARTO raster tiles |
| Geocoding | Nominatim (OpenStreetMap) |
| Database | Supabase (PostgreSQL + PostgREST) |
| Hosting | Netlify (static) |
| CI | GitHub Actions → Netlify (needs `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` secrets) |

No build step, no npm dependencies in the app itself.

---

## Deployment

### Production

```bash
npx netlify-cli deploy --prod --dir .
```

Or push to `main` (if GitHub Actions secrets are configured).

### Local dev

```bash
python3 -m http.server 8080
# http://localhost:8080 — GPS works on same device only
```

Phone testing over HTTPS: use **https://pothole-app.netlify.app** (local HTTP will block GPS).

---

## Project files

```
pothole-app/
├── index.html              # Entire app
├── favicon.svg
├── netlify.toml            # Netlify config + security headers
├── CAPABILITIES.md         # This file
├── supabase/
│   ├── schema.sql
│   ├── cleanup-trials.sql
│   └── clear-all-data.sql
└── .github/workflows/
    └── deploy.yml          # Auto-deploy on push to main
```

---

## Known limitations

- **No user accounts** — email is optional and device-local
- **No in-app delete** — admin cleanup via Supabase SQL only
- **GitHub Actions deploy** — currently requires manual `netlify-cli` deploy unless repo secrets are set
- **Nominatim rate limits** — heavy use may throttle address lookups
- **Driving safety** — UI is large-tap friendly but should only be used when stopped or by a passenger

---

## Quick reference: main constants

| Setting | Value |
|---------|-------|
| Auto-log countdown | 2.5 seconds |
| Green success flash | 0.5 seconds |
| GPS max wait | 8 seconds |
| GPS cache reuse | 90 seconds |
| Target GPS accuracy | ±30 m (accepts best fix sooner if needed |
