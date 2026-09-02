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
                return a.audio === 'sub' ? -1 : 1;
            }
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA;
        });

        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.audio === 'dub' ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        return { streams: stremioStreams };
    } catch (error) {
        console.error("Stream error:", error);
        return { streams: [] };
    }
});

const app = express();
const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

app.use('/', router);

const PORT = process.env.PORT || 7000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Addon listening on port ${PORT}`);
});
            { url: "https://example.com/stream-1080p-dub.m3u8", quality: "1080p", audio: "dub", isSoftSub: false }
        ];

        const validStreams = rawStreams.filter(stream => !(stream.audio === 'sub' && stream.isSoftSub === true));

        validStreams.sort((a, b) => {
            if (a.audio !== b.audio) {
                return a.audio === 'sub' ? -1 : 1;
            }
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA;
        });

        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.isDub ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        res.json({ streams: stremioStreams });
    } catch (error) {
        res.json({ streams: [] });
    }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
            { url: "https://example.com/stream-1080p-dub.m3u8", quality: "1080p", audio: "dub", isSoftSub: false }
        ];

        const validStreams = rawStreams.filter(stream => !(stream.audio === 'sub' && stream.isSoftSub === true));

        validStreams.sort((a, b) => {
            if (a.audio !== b.audio) {
                return a.audio === 'sub' ? -1 : 1;
            }
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA;
        });

        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.isDub ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        res.json({ streams: stremioStreams });
    } catch (error) {
        res.json({ streams: [] });
    }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
            }
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA;
        });

        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.isDub ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        return { streams: stremioStreams };

    } catch (error) {
        console.error("Stream Fetch Error:", error);
        return { streams: [] };
    }
});

async function fetchFromYourAnimeAPI(kitsuId, episode) {
    return [
        { url: "https://example.com/stream-720p.m3u8", quality: "720p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p.m3u8", quality: "1080p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p-dub.m3u8", quality: "1080p", audio: "dub", isSoftSub: false }
    ];
}

const app = express();
const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

app.use('/', router);

const PORT = process.env.PORT || 7000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA; 
        });

        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.isDub ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        return { streams: stremioStreams };

    } catch (error) {
        console.error("Stream Fetch Error:", error);
        return { streams: [] };
    }
});

async function fetchFromYourAnimeAPI(kitsuId, episode) {
    return [
        { url: "https://example.com/stream-720p.m3u8", quality: "720p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p.m3u8", quality: "1080p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p-dub.m3u8", quality: "1080p", audio: "dub", isSoftSub: false }
    ];
}

// Fixed SDK Server Interface binding
const addonInterface = builder.getInterface();
const port = process.env.PORT || 7000;

serveHTTP(addonInterface, { port: port }).then(({ url }) => {
    console.log(`Addon active on ${url}`);
});

        // 1. STRICT FILTER: Drop all soft sub streams
        const validStreams = rawStreams.filter(stream => {
            // If your API returns a stream that relies on external/soft subtitles, drop it.
            if (stream.audio === 'sub' && stream.isSoftSub === true) return false;
            return true;
        });

        // 2. SORTING LOGIC: Sub > Dub, then 1080p > lower qualities
        validStreams.sort((a, b) => {
            // Priority A: Subbed audio over Dubbed audio
            if (a.audio !== b.audio) {
                return a.audio === 'sub' ? -1 : 1; 
            }
            
            // Priority B: Highest resolution first
            // parseInt("1080p") outputs 1080, easily comparing resolutions
            const resA = parseInt(a.quality) || 0;
            const resB = parseInt(b.quality) || 0;
            return resB - resA; 
        });

        // 3. MAP TO STREMIO SDK FORMAT
        const stremioStreams = validStreams.map(stream => ({
            name: `[Hardsub] Anime`,
            description: `${stream.quality} - ${stream.audio.toUpperCase()}\n${stream.isDub ? 'Dubbed' : 'Hardcoded Sub'}`,
            url: stream.url
        }));

        return { streams: stremioStreams };

    } catch (error) {
        console.error("Stream Fetch Error:", error);
        return { streams: [] }; // Fallback gracefully if API crashes
    }
});

// Mock function representing your API call
async function fetchFromYourAnimeAPI(kitsuId, episode) {
    return [
        { url: "https://example.com/stream-720p.m3u8", quality: "720p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p.m3u8", quality: "1080p", audio: "sub", isSoftSub: false },
        { url: "https://example.com/stream-1080p-dub.m3u8", quality: "1080p", audio: "dub", isSoftSub: false }
    ];
}

// Mobile/Cloud deployments map to dynamic environment ports
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Anime Add-on listening on port ${port}`);
                            
