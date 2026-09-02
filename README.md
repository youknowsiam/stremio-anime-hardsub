# Anime Only (Kitsu) - Stremio/Nuvio Addon

Stream-only addon. No catalogs - point it at any Kitsu-id anime list you already have.
Uses [anime-sdk](https://anime-sdk.hexxt.dev) (Allanime primary, MegaPlay fallback) under the hood.

## Behavior
- Input: Kitsu ID (`kitsu:<id>:<episode>`), same format most Kitsu catalogs use.
- Sub is tried first (hardcoded). If no sub stream, falls back to dub.
- All returned streams sorted highest quality first (1080p > 720p > 480p > 360p > auto).
- Streams come back already proxied through this addon (`/proxy`), so headers/Referer requirements are baked in - click an episode in Stremio/Nuvio and it plays, no extra setup on the client side.

## Run locally
```
npm install
PUBLIC_URL=http://localhost:7000 npm start
```
Addon: `http://localhost:7000/manifest.json`

## Deploy (Render, same as before)
1. Push to GitHub, connect repo on Render.
2. Build command: `npm install`. Start command: `npm start`.
3. **Set env var `PUBLIC_URL`** to your Render URL, e.g. `https://your-app.onrender.com` — required before first boot, the addon refuses to start without it (it needs to know its own public URL to build working proxy links).
4. Add `https://your-app.onrender.com/manifest.json` in Stremio/Nuvio.

## How it works internally
Two HTTP listeners in one process: the public one (manifest/stream/proxy-passthrough) and anime-sdk's own server on an internal port (does the actual scraping/resolving + the real `/proxy` that fetches upstream video with the right headers). The public `/proxy` route just forwards bytes to the internal one - Render only exposes one port, so this keeps everything on a single deployed service.

## Known gaps
- **Allanime (primary)**: real API, AES-CTR stream decrypt handled by anime-sdk. Closest to reliable.
- **MegaPlay (fallback)**: only kicks in if Allanime returns nothing for that Kitsu id/episode - uses AniList search internally, so obscure titles Allanime doesn't index may still resolve here.
- **Kitsu → source mapping**: not every Kitsu id maps cleanly to Allanime/MegaPlay's own catalog. anime-sdk resolves this through a cache → MALSync/Anify/arm-server → fuzzy title match waterfall; very obscure or newly-added titles can occasionally mismatch or come back empty.
- **Movies**: `idPrefixes` includes movies but this was built and tested against series episode IDs; a bare `kitsu:<id>` with no episode defaults to episode 1.
