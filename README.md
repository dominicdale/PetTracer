# Fieldnotes for PetTracer

A phone-friendly companion interface with an interactive Leaflet map, lifetime point archive, date filters, saved places, and estimated time outside the home radius. Runs on Cloudflare Pages with an optional private shared D1 archive.

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
- Tap the map to add a named place and radius. Mark one as home to estimate time outside its radius. Place buttons centre the map.
- **Export JSON** saves all points and places, regardless of date filters. Reimport that file to restore. A backup with places replaces local places; ordinary point imports merge with existing fixes.
- Data is stored in this browser's localStorage. Private browsing, clearing site data, and storage quotas can affect retention. Back up regularly. The shared archive is manually synced, not live; sync on each phone after edits. Point imports are idempotent. Places are merged by ID, and local edits win on sync. Concurrent edits are not collaboratively resolved. Place deletion/editing and multiple collar profiles are not implemented.
- Map tiles come from OpenStreetMap, whose server receives the map tiles requested by your browser. Follow its tile usage policy; choose a suitable hosted tile provider for broader traffic. Fonts use local system fallbacks. The interface needs network access for map tiles and does not provide offline maps.

## Statistics

Fixes are sorted chronologically and identical time/coordinate records are deduplicated. Distance is the sum of straight lines between adjacent fixes no more than 15 minutes apart. These are sampled paths, not exact travelled distances; GPS jitter can inflate them. There is no interpolation or speed filtering.

Duration is assigned to the **preceding fix** in each interval up to 15 minutes long. Time near each saved place is counted independently, so overlapping circles can overlap in reported duration. A gap longer than 15 minutes is entirely unknown and splits the drawn path. No duration is inferred before the first or after the last fix. Filters include fixes within local calendar days; intervals crossing a date boundary are omitted, not clipped. "Outside" means outside the home circle, not a sensor-based measurement of indoors/outdoors. These approximations are intentional and visible in the UI.

The lifetime archive is not limited to the portal's retention window, but it can only contain points actually collected. It cannot recover historical points PetTracer no longer exposes. Very large archives will eventually need server-side date filtering, aggregation and map simplification; this first version loads the full archive and draws selected fixes in the browser.

## Deploy privately on Cloudflare Pages

Cloudflare account setup and deployment have not been executed. Do not enable real location uploads until Access is configured.

1. Create a D1 database named `pettracer` using the Cloudflare dashboard or `npx wrangler d1 create pettracer`. Replace the placeholder `database_id` in `wrangler.toml` with the returned ID. This is an identifier, not a secret.
2. Apply the production migration: `npx wrangler d1 migrations apply pettracer --remote`.
3. Create a Pages project, with build command `npm run build` and output directory `dist`. The repository root contains `functions/`; Pages compiles these server-side routes separately. Choose Node 24 for builds. Bind the D1 database as `DB` (the wrangler file declares the binding).
4. In Cloudflare Zero Trust, create a self-hosted Access application covering the **entire production hostname**, with a policy allowing only your and your partner's email addresses. Configure an identity provider such as email one-time PIN.
5. Set Pages runtime variables `ACCESS_TEAM_DOMAIN` to your actual `your-team.cloudflareaccess.com` hostname and `ACCESS_AUD` to the application's audience tag. Both are non-secret identifiers. Redeploy after configuration. The API verifies Access JWT signatures, issuer and audience, and rejects cross-origin mutations. It does not trust email headers alone.
6. Protect preview deployments with Access as well or disable them for real data. Never use demo mode to validate private access.
7. Sign in on each phone. Confirm a signed-out request to `/api/archive` is denied, import a small real sample, sync, then verify it appears after syncing the other phone. Export a backup. Neither the actual identity-provider login nor production D1 access has been validated in development.

The shared database holds one household/collar archive for the two allowed users. It is append-only for points, with a configurable set of places. There is no scheduled collector yet: Cloudflare Pages Functions do not provide scheduled triggers. Automatic collection will need a separate scheduled Worker after the PetTracer API is understood. Keep any future PetTracer credentials in server-side Cloudflare secrets, never Vite client variables or browser bundles.

## Next: connect PetTracer

To investigate without sharing credentials, open the portal on a desktop, open Developer Tools → Network → Fetch/XHR, then load tracking history and change its date range. Record the relevant **request hostname/path, HTTP method, parameter names, and a redacted example response structure**. Remove real coordinates, collar/user IDs, email addresses, cookies, authorization headers, tokens, and any values in authentication query parameters. Do not share a raw HAR or "Copy as cURL" output; these may contain session credentials. We need to establish pagination, retention limits, timestamps, coordinate fields, authentication renewal, and allowed polling rates before implementing a collector.
