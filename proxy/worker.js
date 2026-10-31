/**
 * A small proxy that lets the mood classifier call ReccoBeats from the browser.
 *
 * Browsers only let a page read another site's reply when that site sends an Access-Control-Allow-Origin header.
 * This Worker forwards two kinds of request and adds that header, for the origins listed below only:
 *   /v1/...   -> https://api.reccobeats.com/v1/...   (track lookup, audio features, file analysis)
 *   /oembed   -> https://open.spotify.com/oembed     (title and cover of a Spotify track)
 * Nothing is stored. Deploy: see proxy/README.md.
 */
const ALLOWED_ORIGINS = ['https://mikaelgeraldius.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']

const UPSTREAM = [
  { prefix: '/v1/', target: 'https://api.reccobeats.com' },
  { prefix: '/oembed', target: 'https://open.spotify.com' },
]

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Origin not allowed', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
    if (request.method !== 'GET' && request.method !== 'POST')
      return new Response('Method not allowed', { status: 405 })

    const url = new URL(request.url)
    const route = UPSTREAM.find((r) => url.pathname.startsWith(r.prefix))
    if (!route) return new Response('Not found', { status: 404, headers: cors(origin) })
    // Uploads are 30-second WAV clips, about 1.3 MB; ReccoBeats itself stops at 5 MB.
    if (Number(request.headers.get('Content-Length') || 0) > 5_000_000)
      return new Response('Too large', { status: 413, headers: cors(origin) })

    const upstream = await fetch(route.target + url.pathname + url.search, {
      method: request.method,
      headers: {
        Accept: request.headers.get('Accept') || 'application/json',
        ...(request.headers.get('Content-Type') ? { 'Content-Type': request.headers.get('Content-Type') } : {}),
      },
      body: request.method === 'POST' ? request.body : undefined,
    })
    const headers = new Headers(cors(origin))
    for (const name of ['Content-Type', 'Retry-After']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
