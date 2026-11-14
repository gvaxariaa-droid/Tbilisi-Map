# Tbilisi Property Map

Interactive real-estate and land database for Tbilisi: development projects as map markers, land plots drawn as polygons, photos, search, filters, statistics, and admin/public access.

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, MapLibre GL JS 4 |
| Map data | OpenStreetMap tiles, Esri World Imagery (configurable, e.g. MapTiler) |
| Backend | Node.js 20, Express 4, Zod validation |
| Database | PostgreSQL 13+ with PostGIS 3 |
| Photos | S3-compatible object storage (Cloudflare R2, AWS S3, B2) or local disk |
| Auth | Email + password (bcrypt), httpOnly session cookie, admin / viewer roles |

```
client/   React app (src/components, src/lib, src/state)
server/   Express API (src/routes), SQL migrations, admin script, unit tests
scripts/  backup.sh
Dockerfile, docker-compose.yml, render.yaml
```

## Run locally

Requirements: Node 20+, and Docker (for PostGIS) or a local PostgreSQL with PostGIS.

```bash
# 1. Database
docker compose up -d db

# 2. Server
cp .env.example server/.env          # then edit: set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run install:all
npm run dev:server                   # applies migrations, creates the first admin, listens on :8080

# 3. Client (second terminal)
npm run dev:client                   # http://localhost:5173 (proxies /api to :8080)
```

Or the whole stack in containers: `JWT_SECRET=$(openssl rand -hex 32) ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' docker compose up --build`, then open http://localhost:8080.

Run the tests: `npm test` (server validation/image checks + client area, price, format and filter logic).

## Deploy (permanent public URL)

Recommended: **Render** (Docker web service + managed PostgreSQL, Frankfurt region) with **Cloudflare R2** for photos.

1. Push this folder to a GitHub repository.
2. Create an R2 bucket (keep it private). Create an R2 API token with read/write on that bucket. Note the bucket name, the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`), access key ID and secret.
3. In Render: **New → Blueprint**, pick the repository. `render.yaml` creates the database and web service. Fill in the prompted values: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
4. After the first deploy, sign in, then **delete `ADMIN_PASSWORD`** from the service's environment.
5. Optional: add your own domain in Render's settings. The `*.onrender.com` URL is the public link you share.

Any host that runs a Docker image and offers PostgreSQL with PostGIS works the same way (Railway, Fly.io, a VPS). Supabase or Neon can provide the database: set `DATABASE_URL` and `DATABASE_SSL=true`.

Without object storage, use `STORAGE_DRIVER=local` and mount a persistent disk at `/data/uploads`; otherwise photos are lost on redeploy.

### What you need to provide

| Item | Where it goes |
|---|---|
| PostgreSQL with PostGIS | `DATABASE_URL` (Render fills this in) |
| Session secret | `JWT_SECRET` (Render generates it; locally `openssl rand -hex 32`) |
| First admin email + password | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| S3/R2 bucket + keys | `S3_*` variables |
| Optional MapTiler key | `client/.env` → `VITE_*_TILE_URL`, plus its host in `TILE_ORIGINS` |

No credentials are included in this code. Secrets live only in server environment variables; the browser never receives database or storage credentials. Map-tile keys are the one exception by design: tile providers expect them in the browser, so restrict the key to your domain in the provider's dashboard.

### Map tiles

Defaults need no key: OpenStreetMap for the street map and Esri World Imagery for satellite. Both are fine for internal and light use. OSM's tile servers forbid heavy traffic, and Esri's imagery terms apply. For a busy public site, use a commercial provider (MapTiler has a free tier) and set the URLs in `client/.env` before building.

## Roles and privacy

| | Public link (not signed in) | Viewer | Admin |
|---|---|---|---|
| See projects, land, photos, stats | ✓ | ✓ | ✓ |
| See owner/agent names and phones | | ✓ | ✓ |
| Add, edit, delete records | | | ✓ |
| Manage users | | | ✓ |

Contacts are removed **on the server** for anonymous requests; they are never sent to the browser and hidden there. Every write route checks the admin role on the server.

## Backups

* Render's paid PostgreSQL plans include daily backups; enable point-in-time recovery for business data.
* Independent backups: `DATABASE_URL=... BACKUP_DIR=/backups ./scripts/backup.sh` (custom-format `pg_dump`, verified, 30-day retention). Schedule it with cron; the script header shows the line and the restore command.
* R2/S3: enable object versioning or a lifecycle copy on the photo bucket.

## How key features work

* **Map clicks.** The red selection circle is a map layer at the clicked coordinates, so it stays put when panning, zooming and resizing. Selecting a point and drawing land are separate modes.
* **Projects.** While the project form is open, clicking the map fills latitude and longitude; typing coordinates moves the circle. Markers come from saved records only.
* **Land drawing.** *Add land* → click corners → click the first corner (or *Finish polygon*, or Enter). The plot then stays editable while you fill in the form: drag corners, drag the small edge dots to add corners, select a corner and press Delete (or *Remove corner*) to remove it, Ctrl+Z to undo, Esc to cancel. Crossing edges are blocked.
* **Area.** Shown live in the browser (geodesic formula); on save the server recalculates with PostGIS `ST_Area(geography)` on the WGS84 ellipsoid, which is the stored value. An admin can override it with a hand-entered area (e.g. from a cadastral extract); both values stay visible.
* **Prices.** All amounts are USD. Type either the total or the price per m²; the other is computed (total = area × price/m²). Whichever you typed last is kept when the area changes.
* **Project prices.** Each project has a price history per m² for black, white and green frame. Each entry is one price or a range (from–to) with its date. In the project form an admin can add past or new prices, edit any entry, and delete entries; changes apply on save. The newest entry per frame is the current price. The card and record show the change since the first price, the yearly growth rate, the change between consecutive prices, and a chart. A range counts as its midpoint.
* **Construction stages.** Design, facade works, construction up to 5 floors, construction 5+ floors, exterior finishing, completed, partially completed (blocks).
* **Project colours.** Each project's pin and territory can be blue, green, light orange or red.
* **Theme and language.** The sun/moon switch above the account row changes between the light and the matte navy dark theme; GEO/ENG switches the interface language. Both are remembered per browser.
* **Radius analysis.** Click any point on the map and choose 500 m, 1 km and/or 2 km. Circles appear, and a table shows how many projects fall inside and their average current price per m² for each frame and overall. Click a frame's square to include it in or leave it out of the overall average. The projects inside are listed by distance; clicking one opens its card and moves the map to it.
* **Project territories.** In the project form, *Draw territory* outlines the site with the same drawing tools as land; *Done* returns to the form.
* **Telling land from projects.** Land plots use diagonal hatching with a thick solid border and a square price/area tag. Projects use a smooth fill with a dashed border, a pin with a building icon and, from zoom 15, a rounded tag with the project name and price.
* **Land status.** At the bottom of the land form: SOLD or Not interested (the plot turns pale grey with a large pale stamp), and Seen / Not seen (a green or red dot on the plot's tag and in the inventory).
* **Moving a project.** While the project form is open, drag the red point on the map, click elsewhere, or type the coordinates.
* **Photos.** Projects and land plots both take several photos; the first is the cover.
* **Map layers.** The toggles at the bottom left show or hide projects, project areas, land plots and land price tags.
* **Land plots.** Choose a map colour (light orange, red, green) and record the cadastral code; the code is searchable. From zoom 14, each plot shows a small tag with its total price and area.
* **Statistics.** SQL aggregates over all records. "Under construction" = construction, structure, facade, interior works. "Completed" = completed + delivered.

## Interpretations and deviations from the brief

* **RECORD** button: opens the full record view (every field, timestamps, copy coordinates, open in Google Maps, print). Say if you meant something else.
* **`photo_url` / `file_url` columns**: photos live in one `photos` table with a `storage_key`; the URL is derived as `/api/photos/<id>/file`. This keeps the bucket private and avoids stale links.
* **Required project fields**: name, developer, stage and coordinates are required; price and handover date may be left empty for early-stage projects.
* **Viewer role**: added between "public" and "admin" so colleagues can see contacts without edit rights.
* **Geolocation**: the browser's location button appears when the site is served over HTTPS (or localhost).

## Test status

Run during development: server unit tests (8) and client logic tests (10) pass. These cover price derivation, input validation, image signature checks, USD formatting, filters, edge-crossing detection, and area accuracy (a 100 m × 100 m square in Tbilisi measures within 0.5 % of 10,000 m²). The complete client was bundled with esbuild without errors.

**Not yet verified:**
* Running against a real PostGIS database.
* `tsc` type-checking.
* The Tailwind build.
* Map rendering in a browser.
* The acceptance checklist in the specification (items 1–25).

The development sandbox had no network access, database or browser, so none of these could run there. Work through that checklist after `docker compose up`. Expect to fix small issues in this first run.
