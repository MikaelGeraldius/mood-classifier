/**
 * The Cloudflare Worker in proxy/ that lets the page call ReccoBeats and Spotify from the browser.
 * It's a public address, not a secret, so it lives here rather than in GitHub settings. If you redeploy the
 * Worker under another name, change it here. Set VITE_RECCOBEATS_PROXY at build time only to override it.
 */
export const PROXY_URL = 'https://mood-proxy.mikaelgeraldius.workers.dev'
