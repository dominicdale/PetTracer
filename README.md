# Fieldnotes for PetTracer

A phone-friendly companion interface with an interactive Leaflet map, lifetime point archive, date filters, saved places, and estimated time outside the home radius. The public interface deploys to GitHub Pages.

**Live PetTracer ingestion is not implemented.** The public portal could not be inspected because the development environment's proxy returned HTTP 403 at CONNECT, even after its hostname was allowed. No API endpoints, authentication flow, or historical-data availability have been verified. The portal has no export option according to the owner. Imports are a generic fallback for independently acquired data, not a verified PetTracer export integration. Demo data is fictional and never stored or synced.

## Develop

Requires Node 22.12+ (validated with Node 24.19) and npm.

```sh
cd /workspace/PetTracer
npm ci --cache /workspace/.npm-cache
npm run dev
```

Vite serves the frontend only. To exercise Cloudflare Functions:

```sh
npm run build
XDG_CONFIG_HOME=/workspace/.config WRANGLER_SEND_METRICS=false npm run db:local
XDG_CONFIG_HOME=/workspace/.config WRANGLER_SEND_METRICS=false npm run pages:dev -- --port 8788
```

Without Access configuration `/api/archive` returns 503 by design; demo, local imports, and local statistics still work. No authentication bypass is provided. Tests run archive handlers against in-memory SQLite separately from the authentication middleware, and test rejection of unauthenticated/forged requests. Successful real Cloudflare Access login requires deployment and remains unverified.

```sh
npm test
npm run build
```

## Use

- Select **Try demo** for a fictional walk; **Exit demo** restores your local archive.
- Import a JSON array with `{ "lat": 51.5, "lng": -0.09, "time": "2026-10-16T10:00:00Z" }` records, or a simple unquoted CSV with `lat,lng,time` columns. Files may be up to 2 MB; timestamps must include a timezone.
- Firefox users can copy a PetTracer device JSON response from Developer Tools → Network → XHR → Response and use **Paste PetTracer JSON**. Positioned `fiFo` telegrams and `lastPos` are imported; radio/status telegrams without coordinates are ignored. The JSON is processed locally and is not uploaded. Responses can contain real locations, device identifiers and raw telegrams, so do not share or commit them.
- Tap the map to add a named place and radius. Mark one as home to estimate time outside its radius. Place buttons centre the map.
- **Export JSON** saves all points and places, regardless of date filters. Reimport that file to restore. A backup with places replaces local places; ordinary point imports merge with existing fixes.
- Data is stored in this browser's localStorage. Private browsing, clearing site data, and storage quotas can affect retention. Back up regularly. The shared archive is manually synced, not live; sync on each phone after edits. Point imports are idempotent. Places are merged by ID, and local edits win on sync. Concurrent edits are not collaboratively resolved. Place deletion/editing and multiple collar profiles are not implemented.
- Map tiles come from OpenStreetMap, whose server receives the map tiles requested by your browser. Follow its tile usage policy; choose a suitable hosted tile provider for broader traffic. Fonts use local system fallbacks. The interface needs network access for map tiles and does not provide offline maps.

## Statistics

Fixes are sorted chronologically and identical time/coordinate records are deduplicated. Distance is the sum of straight lines between adjacent fixes no more than 15 minutes apart. These are sampled paths, not exact travelled distances; GPS jitter can inflate them. There is no interpolation or speed filtering.

Duration is assigned to the **preceding fix** in each interval up to 15 minutes long. Time near each saved place is counted independently, so overlapping circles can overlap in reported duration. A gap longer than 15 minutes is entirely unknown and splits the drawn path. No duration is inferred before the first or after the last fix. Filters include fixes within local calendar days; intervals crossing a date boundary are omitted, not clipped. "Outside" means outside the home circle, not a sensor-based measurement of indoors/outdoors. These approximations are intentional and visible in the UI.

The lifetime archive is not limited to the portal's retention window, but it can only contain points actually collected. It cannot recover historical points PetTracer no longer exposes. Very large archives will eventually need server-side date filtering, aggregation and map simplification; this first version loads the full archive and draws selected fixes in the browser.

## Deploy on GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` tests, builds and deploys every push to `main`.

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open the **Actions** tab and allow the `Deploy to GitHub Pages` workflow to finish.
4. Visit `https://dominicdale.github.io/PetTracer/`.

GitHub Pages is a public static host. The site code and URL are public, but imported locations stay in that browser's local storage and are not uploaded to GitHub. Use **Export JSON** and **Import points** to transfer the archive between your phones. Anyone using the URL gets their own empty browser archive. Shared server-side syncing and automatic collar collection require a separate private backend and are disabled in the GitHub Pages build.

The Cloudflare Functions and D1 prototype remains in the repository for a future private backend. Keep any future PetTracer credentials in server-side secrets, never Vite client variables or browser bundles.

## Next: connect PetTracer

To investigate without sharing credentials, open the portal on a desktop, open Developer Tools → Network → Fetch/XHR, then load tracking history and change its date range. Record the relevant **request hostname/path, HTTP method, parameter names, and a redacted example response structure**. Remove real coordinates, collar/user IDs, email addresses, cookies, authorization headers, tokens, and any values in authentication query parameters. Do not share a raw HAR or "Copy as cURL" output; these may contain session credentials. We need to establish pagination, retention limits, timestamps, coordinate fields, authentication renewal, and allowed polling rates before implementing a collector.
