const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const manifest = {
    id: 'com.anime.hardsub',
    version: '1.0.0',
    name: 'Anime Hardsub Priority',
    description: '1080p Hardcoded Sub streams prioritized at the top, followed by Dubs.',
    types: ['series', 'movie'],
    catalogs: [],
    resources: ['stream'],
    // This strict prefix forces Stremio to only route Kitsu metadata to this add-on
    idPrefixes: ['kitsu:'] 
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    // Stremio Kitsu format: kitsu:{anime_id}:{episode} (e.g., kitsu:11:1)
    if (!id.startsWith('kitsu:')) {
        return { streams: [] };
    }

    const parts = id.split(':');
    const kitsuId = parts[1];
    const episode = parts[2] || 1; // Default to 1 for movies

    try {
        /*
          =========================================
          API SCRAPING LOGIC
          =========================================
          Replace this dummy array with an Axios call to your anime API 
          (e.g., Consumet pulling from Gogoanime).
          Ensure your source site provides Hardsubs (video files with burned-in text).
        */
        const rawStreams = await fetchFromYourAnimeAPI(kitsuId, episode);

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
                            
