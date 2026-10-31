import { describe, expect, it } from 'vitest'
import { average, clipStarts, encodeWav, parseEmbed, pickFeatures, spotifyTrackId } from './songs'

const ID = '4uLU6hMCjMI75M1A2tKUQC'

describe('spotifyTrackId', () => {
  it('reads the common link shapes', () => {
    expect(spotifyTrackId(`https://open.spotify.com/track/${ID}?si=abc123`)).toBe(ID)
    expect(spotifyTrackId(`https://open.spotify.com/intl-id/track/${ID}`)).toBe(ID)
    expect(spotifyTrackId(`https://open.spotify.com/embed/track/${ID}`)).toBe(ID)
    expect(spotifyTrackId(`spotify:track:${ID}`)).toBe(ID)
    expect(spotifyTrackId(`  ${ID}  `)).toBe(ID)
  })
  it('refuses albums, playlists and other sites', () => {
    expect(spotifyTrackId(`https://open.spotify.com/album/${ID}`)).toBeNull()
    expect(spotifyTrackId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(spotifyTrackId('')).toBeNull()
  })
})

describe('pickFeatures', () => {
  const row = {
    danceability: 0.5,
    energy: 0.6,
    loudness: -7,
    speechiness: 0.05,
    acousticness: 0.1,
    instrumentalness: 0,
    liveness: 0.1,
    valence: 0.4,
    tempo: 120,
    key: 5,
  }
  it('returns the nine features in model order', () => {
    expect(pickFeatures(row)).toEqual([0.5, 0.6, -7, 0.05, 0.1, 0, 0.1, 0.4, 120])
  })
  it('refuses incomplete answers', () => {
    expect(pickFeatures({ ...row, tempo: undefined })).toBeNull()
    expect(pickFeatures(null)).toBeNull()
  })
})

describe('clips', () => {
  it('sends a short song whole and spreads three clips over a long one', () => {
    expect(clipStarts(25)).toEqual([0])
    expect(clipStarts(60)).toHaveLength(1)
    const starts = clipStarts(240)
    expect(starts).toHaveLength(3)
    starts.forEach((s) => expect(s + 30).toBeLessThanOrEqual(240))
  })
  it('averages clip results feature by feature', () => {
    expect(
      average([
        [0, 10],
        [1, 20],
      ]),
    ).toEqual([0.5, 15])
  })
  it('keeps a 30 s clip well under the 5 MB upload limit', () => {
    const wav = encodeWav(new Float32Array(30 * 22050), 22050)
    expect(wav.byteLength).toBeLessThan(5e6)
    expect(String.fromCharCode(...new Uint8Array(wav, 0, 4))).toBe('RIFF')
  })
})

describe('parseEmbed', () => {
  it('finds the preview, title, artists and cover in Spotify’s embed page', () => {
    const entity = {
      name: 'Never Gonna Give You Up',
      artists: [{ name: 'Rick Astley' }],
      audioPreview: { url: 'https://p.scdn.co/mp3-preview/abc123def456' },
      visualIdentity: { image: [{ url: 'https://i.scdn.co/image/small' }, { url: 'https://i.scdn.co/image/big' }] },
    }
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { state: { data: { entity } } } },
    })}</script></html>`
    expect(parseEmbed(html)).toEqual({
      preview: 'https://p.scdn.co/mp3-preview/abc123def456',
      title: 'Never Gonna Give You Up',
      artists: 'Rick Astley',
      cover: 'https://i.scdn.co/image/big',
    })
  })
  it('reads an escaped preview URL and survives a page without data', () => {
    expect(parseEmbed('"url":"https:\\u002F\\u002Fp.scdn.co\\u002Fmp3-preview\\u002Fxyz789"').preview).toBe(
      'https://p.scdn.co/mp3-preview/xyz789',
    )
    expect(parseEmbed('<html></html>').preview).toBeUndefined()
  })
})
