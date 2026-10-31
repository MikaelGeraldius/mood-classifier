/**
 * Getting the nine features for a song of your own.
 *
 * Spotify closed its audio-features endpoint to new apps in November 2024. ReccoBeats (reccobeats.com) offers
 * the same nine features on the same scales, free and without a key, in two ways:
 *   - by Spotify track:  GET  https://api.reccobeats.com/v1/audio-features?ids=<spotify id>
 *   - from an audio file: POST https://api.reccobeats.com/v1/analysis/audio-features  (multipart, field
 *     "audioFile", up to 5 MB, only the first 30 seconds are analysed)
 * Uploads are decoded here first and sent as up to three 30-second mono WAV clips from across the song; the
 * results are averaged.
 *
 * ReccoBeats is a small service and goes down (its server answered 530 / Cloudflare 1033 in October 2026). Then
 * the page works the features out itself (src/analysis.ts): from the uploaded file, or for a Spotify link from
 * the track's public 30-second preview, found in Spotify's embed page. Those are estimates, and the page says so.
 */
import { analyseAudio } from './analysis'
import { PROXY_URL } from './config'
import { featureKeys } from './content'

/**
 * Where requests go. ReccoBeats may not allow calls straight from web pages (CORS), so they can go through a
 * small proxy that adds the header: Vite's dev-server proxy during `npm run dev`, and the Cloudflare Worker in
 * proxy/ on the live site (its URL is set at build time as VITE_RECCOBEATS_PROXY). Without either, direct.
 */
/** Only a bare origin counts (https://host, no path): a mistyped value must not send every lookup astray. */
export function proxyOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && (url.pathname === '/' || url.pathname === '') && !url.search
      ? url.origin
      : undefined
  } catch {
    return undefined
  }
}
// During `npm run dev` the dev server's own proxy is used (vite.config.ts); the built site uses the Worker.
const PROXY =
  proxyOrigin(import.meta.env.VITE_RECCOBEATS_PROXY as string | undefined) ??
  (import.meta.env.DEV ? undefined : proxyOrigin(PROXY_URL))
const API = PROXY ? `${PROXY}/v1` : import.meta.env.DEV ? '/reccobeats/v1' : 'https://api.reccobeats.com/v1'
const SPOTIFY = PROXY ?? (import.meta.env.DEV ? '/spotify' : 'https://open.spotify.com')
const SCDN = PROXY ?? (import.meta.env.DEV ? '/scdn' : 'https://p.scdn.co')
export const viaProxy = Boolean(PROXY) || import.meta.env.DEV

export interface Song {
  /** Stable key: "spotify:<id>" or "file:<name>:<size>". */
  key: string
  title: string
  artist?: string
  cover?: string
  link?: string
  f: number[]
  /** Where the numbers came from. */
  via: 'reccobeats' | 'reccobeats-file' | 'estimate' | 'estimate-preview'
  added: number
}

// ---- Spotify links

/** Accepts open.spotify.com/track/… (with or without intl-xx and query), spotify:track:…, or a bare 22-char id. */
export function spotifyTrackId(input: string): string | null {
  const s = input.trim()
  const url = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?track\/([A-Za-z0-9]{22})/)
  if (url) return url[1]
  const uri = s.match(/^spotify:track:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s
  return null
}

/** Pulls the nine features, in model order, out of whatever object holds them. Null if any is missing. */
export function pickFeatures(obj: unknown): number[] | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const f = featureKeys.map((k) => (typeof o[k] === 'number' ? (o[k] as number) : Number.NaN))
  return f.every(Number.isFinite) ? f : null
}

/** ReccoBeats lists come as { content: [...] }; single objects come bare. */
function first(json: unknown): unknown {
  if (Array.isArray(json)) return json[0]
  if (json && typeof json === 'object' && 'content' in json) {
    const c = (json as { content: unknown }).content
    return Array.isArray(c) ? c[0] : c
  }
  return json
}

export class SongError extends Error {}

async function getJson(url: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    // fetch only throws without an answer: no network, or the browser refused to hand over a reply
    // (a missing CORS header, an extension, a page that forbids outside requests).
    throw new SongError(navigator.onLine === false ? 'offline' : 'blocked')
  }
  if (res.status === 429) throw new SongError('busy')
  if (!res.ok) throw new SongError(`http-${res.status}`)
  return res.json()
}

export async function songFromSpotify(id: string, progress?: Progress): Promise<Song> {
  const link = `https://open.spotify.com/track/${id}`
  // Title and cover from Spotify's public oEmbed; artist and features from ReccoBeats. Each is optional but the features.
  const [embed, track, direct] = await Promise.allSettled([
    getJson(`${SPOTIFY}/oembed?url=${encodeURIComponent(link)}`),
    getJson(`${API}/track?ids=${id}`),
    getJson(`${API}/audio-features?ids=${id}`),
  ])
  let f = direct.status === 'fulfilled' ? pickFeatures(first(direct.value)) : null
  const meta = track.status === 'fulfilled' ? (first(track.value) as Record<string, unknown> | undefined) : undefined
  // Fallback: look the track up by its ReccoBeats id.
  if (!f && meta && typeof meta.id === 'string') {
    try {
      f = pickFeatures(first(await getJson(`${API}/track/${meta.id}/audio-features`)))
    } catch {
      /* reported below */
    }
  }
  const e = embed.status === 'fulfilled' ? (embed.value as Record<string, unknown>) : {}
  const artists = Array.isArray(meta?.artists)
    ? (meta!.artists as { name?: string }[])
        .map((a) => a.name)
        .filter(Boolean)
        .join(', ')
    : undefined
  const base = {
    key: `spotify:${id}`,
    title:
      (typeof meta?.trackTitle === 'string' && meta.trackTitle) ||
      (typeof e.title === 'string' && e.title) ||
      'Spotify track',
    artist: artists || undefined,
    cover: typeof e.thumbnail_url === 'string' ? e.thumbnail_url : undefined,
    link,
    added: Date.now(),
  }
  if (f) return { ...base, f, via: 'reccobeats' }

  // No features from ReccoBeats (down, or it doesn't know the track): analyse Spotify's 30-second preview here.
  progress?.('Fetching Spotify’s 30-second preview')
  let html: string
  try {
    const res = await fetch(`${SPOTIFY}/embed/track/${id}`)
    if (!res.ok) throw new SongError(`http-${res.status}`)
    html = await res.text()
  } catch (error) {
    throw error instanceof SongError ? error : new SongError(navigator.onLine === false ? 'offline' : 'blocked')
  }
  const embedInfo = parseEmbed(html)
  if (!embedInfo.preview) throw new SongError('no-preview')
  let audio: ArrayBuffer
  try {
    const res = await fetch(embedInfo.preview.replace('https://p.scdn.co', SCDN))
    if (!res.ok) throw new SongError(`http-${res.status}`)
    audio = await res.arrayBuffer()
  } catch (error) {
    throw error instanceof SongError ? error : new SongError('blocked')
  }
  progress?.('Analysing the preview')
  const { samples } = await decodeMono(audio)
  return {
    ...base,
    title: base.title === 'Spotify track' && embedInfo.title ? embedInfo.title : base.title,
    artist: base.artist ?? embedInfo.artists,
    cover: base.cover ?? embedInfo.cover,
    f: analyseAudio(samples, RATE).f,
    via: 'estimate-preview',
  }
}

/** Pulls the preview MP3, title, artists and cover out of Spotify's embed page (its __NEXT_DATA__ JSON). */
export function parseEmbed(html: string): { preview?: string; title?: string; artists?: string; cover?: string } {
  const text = html.replace(/\\u002F/g, '/')
  const preview = text.match(/https:\/\/p\.scdn\.co\/mp3-preview\/[A-Za-z0-9]+/)?.[0]
  let title: string | undefined
  let artists: string | undefined
  let cover: string | undefined
  const data = text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  if (data) {
    try {
      const entity = JSON.parse(data)?.props?.pageProps?.state?.data?.entity
      if (entity) {
        title = entity.name ?? entity.title
        if (Array.isArray(entity.artists))
          artists = entity.artists
            .map((a: { name?: string }) => a.name)
            .filter(Boolean)
            .join(', ')
        const images = entity.visualIdentity?.image ?? entity.coverArt?.sources
        if (Array.isArray(images) && images.length) cover = images[images.length - 1].url
      }
    } catch {
      /* the regex result above is enough */
    }
  }
  return { preview, title, artists: artists || undefined, cover }
}

// ---- Audio files

export const CLIP_SECONDS = 30
const RATE = 22050

/** Where to take clips from: one for a short song, otherwise up to three spread across it. */
export function clipStarts(duration: number, clip = CLIP_SECONDS): number[] {
  if (duration <= clip + 1) return [0]
  const span = duration - clip
  const starts = [0.2, 0.5, 0.8].map((p) => Math.round(span * p))
  return duration < clip * 2.5 ? [starts[1]] : starts
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

/** Decodes any format the browser can play and resamples to mono 22.05 kHz. */
async function decodeMono(data: ArrayBuffer): Promise<{ samples: Float32Array; duration: number }> {
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(data)
  } catch {
    throw new SongError('decode')
  } finally {
    void ctx.close()
  }
  const length = Math.ceil(decoded.duration * RATE)
  const off = new OfflineAudioContext(1, length, RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return { samples: rendered.getChannelData(0), duration: decoded.duration }
}

export function average(rows: number[][]): number[] {
  return rows[0].map((_, i) => rows.reduce((sum, r) => sum + r[i], 0) / rows.length)
}

export type Progress = (step: string) => void

export async function songFromFile(file: File, progress: Progress): Promise<Song> {
  progress('Reading the audio')
  const { samples, duration } = await decodeMono(await file.arrayBuffer())
  const starts = clipStarts(duration)
  const results: number[][] = []
  let lastError: SongError | null = null
  for (let i = 0; i < starts.length; i++) {
    progress(starts.length > 1 ? `Analysing part ${i + 1} of ${starts.length}` : 'Analysing')
    const clip = samples.subarray(starts[i] * RATE, (starts[i] + CLIP_SECONDS) * RATE)
    const form = new FormData()
    form.append('audioFile', new Blob([encodeWav(clip, RATE)], { type: 'audio/wav' }), 'clip.wav')
    try {
      const f = pickFeatures(first(await getJson(`${API}/analysis/audio-features`, { method: 'POST', body: form })))
      if (f) results.push(f)
    } catch (error) {
      lastError = error instanceof SongError ? error : new SongError('offline')
      if (lastError.message === 'offline' || lastError.message === 'blocked') break
    }
  }
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')
  const key = `file:${file.name}:${file.size}`
  if (results.length) return { key, title, f: average(results), via: 'reccobeats-file', added: Date.now() }

  // ReccoBeats unavailable: work the features out here.
  progress('Analysing it in your browser')
  void lastError
  return { key, title, f: analyseAudio(samples, RATE).f, via: 'estimate', added: Date.now() }
}

// ---- Your songs, kept in this browser

const STORE = 'mood-classifier:songs'

export function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORE)
    const list = raw ? (JSON.parse(raw) as Song[]) : []
    return list.filter((s) => Array.isArray(s.f) && s.f.length === featureKeys.length)
  } catch {
    return []
  }
}

export function saveSongs(list: Song[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 24)))
  } catch {
    /* private mode: the list lives for this visit only */
  }
}

export function songErrorText(error: unknown): string {
  const code = error instanceof SongError ? error.message : 'unknown'
  if (code === 'no-preview')
    return 'ReccoBeats is unavailable and Spotify has no 30-second preview for this track, so it can’t be analysed from the link. Upload the audio file instead.'
  if (code === 'busy') return 'ReccoBeats is busy right now. Wait a few seconds and try again.'
  if (code === 'offline') return 'You’re offline. Reconnect and try again, or upload the file to measure it here.'
  if (code === 'blocked')
    return viaProxy
      ? 'Couldn’t get this track through the proxy. Try again in a minute, or upload the audio file instead.'
      : 'Your browser blocked the lookup: this site needs its proxy (see the README). You can still upload the audio file; it is analysed in your browser.'
  if (code === 'decode') return 'This browser can’t read that file. Try an MP3, WAV, OGG, M4A or FLAC.'
  if (code.startsWith('http-'))
    return `The lookup failed (error ${code.slice(5)}). Try again in a moment, or upload the audio file instead.`
  return 'Something went wrong reading that song. Try again, or set the sliders by hand.'
}
