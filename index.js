const http = require('http');
const { URL } = require('url');
const {
    HttpClient,
    AllmangaProvider,
    MegaPlayProvider,
    KitsuMeta,
    startServer
} = require('anime-sdk');

const PORT = process.env.PORT || 7000;
const INTERNAL_PORT = Number(PORT) + 1; // anime-sdk's own server, not exposed publicly
const PUBLIC_URL = process.env.PUBLIC_URL; // e.g. https://your-app.onrender.com - REQUIRED, see README

if (!PUBLIC_URL) {
    console.error("Set PUBLIC_URL env var to this addon's public deployed URL (see README).");
    process.exit(1);
}

const QUALITY_RANK = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1, auto: 0 };

const manifest = {
    id: 'community.animeonly.kitsu.stremio',
    version: '2.0.0',
    name: 'Anime Only (Kitsu)',
    description: 'Anime streams by Kitsu ID. Sub priority, dub fallback, highest quality first.',
    resources: ['stream'],
    types: ['series', 'movie'],
    catalogs: [],
    idPrefixes: ['kitsu:']
};

// ---------- internal anime-sdk server (resolves streams, hosts the /proxy) ----------
const nodeHttp = new HttpClient();
startServer({
    providers: [new AllmangaProvider(nodeHttp), new MegaPlayProvider(nodeHttp)],
    metaProviders: [new KitsuMeta(nodeHttp)],
    port: INTERNAL_PORT,
    proxy: true,
    proxyBase: `${PUBLIC_URL}/proxy`
});

async function fetchJson(path) {
    const res = await fetch(`http://localhost:${INTERNAL_PORT}${path}`);
    if (!res.ok) return null;
    return res.json();
}

async function resolveForProvider(contentProvider, kitsuUrn, episode) {
    // sub first (hardcoded priority), dub as fallback
    for (const language of ['sub', 'dub']) {
        const url = `/meta/stream?provider=kitsu&id=${encodeURIComponent(kitsuUrn)}&episode=${episode}&contentProvider=${contentProvider}&language=${language}`;
        const data = await fetchJson(url);
        if (data && data.type === 'video' && data.streams && data.streams.length) {
            return data.streams.map(s => ({ ...s, language }));
        }
    }
    return [];
}

// ---------- public server: manifest + stream + proxy passthrough ----------
const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);

    // CORS for Stremio/Nuvio clients
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (parsed.pathname === '/manifest.json') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(manifest));
        return;
    }

    const streamMatch = parsed.pathname.match(/^\/stream\/(series|movie)\/(.+)\.json$/);
    if (streamMatch) {
        try {
            const id = decodeURIComponent(streamMatch[2]); // kitsu:<id>:<episode> or kitsu:<id> for movies
            const parts = id.split(':');
            const kitsuId = parts[1];
            const episode = parts[2] ? parseInt(parts[2], 10) : 1;
            const kitsuUrn = `kitsu:${kitsuId}`;

            let streams = await resolveForProvider('allmanga', kitsuUrn, episode);
            if (!streams.length) streams = await resolveForProvider('megaplay', kitsuUrn, episode);

            streams.sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0));

            const stremioStreams = streams.map(s => ({
                name: `Anime · ${s.quality || 'auto'}`,
                title: `${s.language.toUpperCase()} · ${s.quality || 'auto'}${s.isHLS ? ' · HLS' : ''}`,
                url: s.sourceUrl // already proxy-rewritten, playable as-is, no extra headers needed
            }));

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ streams: stremioStreams }));
        } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ streams: [], error: String(err) }));
        }
        return;
    }

    if (parsed.pathname === '/proxy') {
        // forward as-is to the internal anime-sdk proxy (handles headers, HLS rewriting, range requests)
        const target = `http://localhost:${INTERNAL_PORT}${parsed.pathname}${parsed.search}`;
        const upstream = http.request(target, { method: 'GET', headers: req.headers }, upstreamRes => {
            res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
            upstreamRes.pipe(res);
        });
        upstream.on('error', () => { res.statusCode = 502; res.end('proxy error'); });
        req.pipe(upstream);
        return;
    }

    res.statusCode = 404;
    res.end('not found');
});

server.listen(PORT, () => console.log(`Anime Only addon on http://localhost:${PORT}/manifest.json`));
