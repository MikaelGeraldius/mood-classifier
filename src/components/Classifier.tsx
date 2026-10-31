import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { argmax, moodGrid, predict, sweep, type Forest } from '../forest'
import {
  features,
  featureKeys,
  importanceOf,
  moodNames,
  pct,
  presets,
  sampleTracks,
  sliderOrder,
  type Track,
} from '../content'
import { glideTo } from '../hooks'
import { loadSongs, saveSongs, songErrorText, songFromFile, songFromSpotify, spotifyTrackId, type Song } from '../songs'

type Source =
  | { kind: 'preset'; mood: number }
  | { kind: 'track'; track: Track }
  | { kind: 'song'; song: Song }
  | { kind: 'custom' }

const V = featureKeys.indexOf('valence')
const E = featureKeys.indexOf('energy')
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function Classifier({ forest, error }: { forest: Forest | null; error: string | null }) {
  const [x, setX] = useState<number[]>(() => presets[1].slice())
  const [source, setSource] = useState<Source>({ kind: 'preset', mood: 1 })
  const [songs, setSongs] = useState<Song[]>(() => loadSongs())
  const trackCursor = useRef(0)
  const bench = useRef<HTMLDivElement>(null)

  const probs = useMemo(() => (forest ? Array.from(predict(forest, x)) : null), [forest, x])
  const mood = probs ? argmax(probs) : -1

  // The sweeps and the map cost ~2,000 forest calls; let them trail a fast drag by a frame.
  const lagged = useDeferredValue(x)
  const laggedMood = useDeferredValue(mood)
  const lines = useMemo(
    () =>
      forest && laggedMood >= 0 ? features.map((f, i) => sweep(forest, lagged, i, f.min, f.max, laggedMood)) : null,
    [forest, lagged, laggedMood],
  )
  const grid = useMemo(() => (forest ? moodGrid(forest, lagged, V, E) : null), [forest, lagged])

  useEffect(() => saveSongs(songs), [songs])

  const set = (i: number, v: number) => {
    setX((prev) => {
      const next = prev.slice()
      next[i] = v
      return next
    })
    setSource({ kind: 'custom' })
  }

  const loadPreset = (k: number) => {
    setX(presets[k].slice())
    setSource({ kind: 'preset', mood: k })
  }
  const loadTrack = () => {
    const track = sampleTracks[trackCursor.current++ % sampleTracks.length]
    setX(track.f.slice())
    setSource({ kind: 'track', track })
  }
  const loadSong = (song: Song, glide = false) => {
    setX(song.f.slice())
    setSource({ kind: 'song', song })
    if (glide) requestAnimationFrame(() => glideTo(bench.current))
  }
  const addSong = (song: Song) => {
    setSongs((list) => [song, ...list.filter((s) => s.key !== song.key)])
    loadSong(song, true)
  }
  const removeSong = (key: string) => setSongs((list) => list.filter((s) => s.key !== key))

  return (
    <section className="chapter classifier" id="try" data-tone="raised" aria-labelledby="try-title">
      <div className="intro">
        <h2 id="try-title" data-reveal className="reveal">
          Check a song
        </h2>
        <p className="lead reveal" data-reveal>
          Paste a Spotify link or upload an audio file. The forest reads its nine features and names the mood.
        </p>
      </div>

      <SongInput onSong={addSong} fallback={presets[1]} />

      {songs.length ? (
        <div className="shelf" aria-labelledby="shelf-title">
          <div className="shelf-head">
            <h3 id="shelf-title">Your songs</h3>
            <p className="small">Saved in this browser only.</p>
          </div>
          <ul className="shelf-list">
            {songs.map((song) => {
              const k = forest ? argmax(predict(forest, song.f)) : -1
              const active = source.kind === 'song' && source.song.key === song.key
              return (
                <li key={song.key} className="song-card" data-active={active || undefined}>
                  <button
                    type="button"
                    className="song-main"
                    onClick={() => loadSong(song, true)}
                    aria-pressed={active}
                  >
                    <Cover song={song} />
                    <span className="song-title">{song.title}</span>
                    <span className="small song-sub">
                      {k >= 0 ? moodNames[k] : '…'}
                      {song.artist ? ` · ${song.artist}` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="song-remove"
                    onClick={() => removeSong(song.key)}
                    aria-label={`Remove ${song.title}`}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="starts">
        <fieldset className="chips">
          <legend className="small">Or start from a typical</legend>
          {moodNames.map((name, k) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={source.kind === 'preset' && source.mood === k}
              onClick={() => loadPreset(k)}
            >
              {name.toLowerCase()} song
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={source.kind === 'track'} onClick={loadTrack}>
            {source.kind === 'track' ? 'another dataset song' : 'a song from the dataset'}
          </button>
        </fieldset>
      </div>

      <div className="workbench" ref={bench}>
        <div className="controls">
          <p className="small caption">
            {mood >= 0 ? (
              <>
                The line over each slider is the chance of <strong>{moodNames[mood].toLowerCase()}</strong> if you moved
                only that slider.
              </>
            ) : (
              'Sliders are ordered by how much the model relies on them.'
            )}
          </p>
          <ul className="sliders">
            {sliderOrder.map((i) => (
              <Slider key={i} index={i} value={x[i]} line={lines?.[i] ?? null} onChange={(v) => set(i, v)} />
            ))}
          </ul>
        </div>

        <div className="readout" aria-live="polite">
          {error ? (
            <p className="lead">The model could not load. {error}</p>
          ) : !probs ? (
            <p className="lead loading">Loading the forest, 1.4 MB</p>
          ) : (
            <Readout probs={probs} mood={mood} source={source} />
          )}
          <MoodMap
            grid={grid}
            x={x}
            mood={mood}
            onMove={(v, e) => {
              setX((prev) => {
                const next = prev.slice()
                next[V] = v
                next[E] = e
                return next
              })
              setSource({ kind: 'custom' })
            }}
          />
        </div>
      </div>
    </section>
  )
}

function Cover({ song, size = 'sm' }: { song: Song; size?: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  if (song.cover && !failed)
    return (
      <img className={`cover cover-${size}`} src={song.cover} alt="" loading="lazy" onError={() => setFailed(true)} />
    )
  // No artwork (an uploaded file): a tile with the title's first letter.
  return (
    <span className={`cover cover-${size} cover-blank`} aria-hidden="true">
      {song.title.trim().charAt(0).toUpperCase() || 'S'}
    </span>
  )
}

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'error'; text: string }

function SongInput({ onSong, fallback }: { onSong: (song: Song) => void; fallback: number[] }) {
  const [link, setLink] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const busy = status.kind === 'busy'

  const submitLink = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    const id = spotifyTrackId(link)
    if (!id) {
      setStatus({
        kind: 'error',
        text: 'That isn’t a Spotify track link. In Spotify, choose Share, then Copy song link, and paste it here.',
      })
      return
    }
    setStatus({ kind: 'busy', text: 'Looking up the track' })
    try {
      onSong(await songFromSpotify(id))
      setLink('')
      setStatus({ kind: 'idle' })
    } catch (e) {
      setStatus({ kind: 'error', text: songErrorText(e) })
    }
  }

  const takeFile = async (f: File | undefined) => {
    if (!f || busy) return
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|oga|m4a|aac|flac|aif|aiff|webm|opus)$/i.test(f.name)) {
      setStatus({ kind: 'error', text: 'That doesn’t look like an audio file. Try an MP3, WAV, OGG, M4A or FLAC.' })
      return
    }
    try {
      const song = await songFromFile(f, fallback, (text) => setStatus({ kind: 'busy', text }))
      onSong(song)
      setStatus(
        song.via === 'estimate'
          ? {
              kind: 'error',
              text: 'ReccoBeats couldn’t be reached, so this page measured loudness, tempo and energy itself and used typical values for the rest. Adjust the sliders if you know better.',
            }
          : { kind: 'idle' },
      )
    } catch (e) {
      setStatus({ kind: 'error', text: songErrorText(e) })
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  return (
    <div className="song-input" data-busy={busy || undefined}>
      <form className="link-form" onSubmit={submitLink} noValidate>
        <label htmlFor="song-link" className="visually-hidden">
          Spotify song link
        </label>
        <input
          id="song-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a Spotify song link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="button" disabled={busy || !link.trim()}>
          Check mood
        </button>
      </form>

      <label
        className="drop"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void takeFile(e.dataTransfer.files[0])
        }}
      >
        <input
          ref={file}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aiff"
          className="visually-hidden"
          onChange={(e) => void takeFile(e.target.files?.[0])}
          disabled={busy}
        />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="drop-icon">
          <path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15" />
        </svg>
        <span>
          <strong>Upload a song</strong>
          <span className="small"> or drop an audio file here</span>
        </span>
      </label>

      <p className={`small status status-${status.kind}`} role="status">
        {status.kind === 'busy' ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {status.text}…
          </>
        ) : status.kind === 'error' ? (
          status.text
        ) : (
          <>
            Features come from <a href="https://reccobeats.com">ReccoBeats</a>, which uses Spotify’s scales. An upload
            sends up to three 30-second clips there; the mood itself is worked out in your browser.
          </>
        )}
      </p>
    </div>
  )
}

function Readout({ probs, mood, source }: { probs: number[]; mood: number; source: Source }) {
  return (
    <div>
      {source.kind === 'song' ? (
        <div className="now">
          <Cover song={source.song} size="lg" />
          <div>
            <p className="now-title">{source.song.title}</p>
            <p className="small">
              {source.song.artist ??
                (source.song.via === 'estimate' ? 'Uploaded file, partly estimated' : 'Uploaded file')}
              {source.song.link ? (
                <>
                  {' · '}
                  <a href={source.song.link}>Open in Spotify</a>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}
      <p className="verdict" key={mood}>
        {moodNames[mood]}
      </p>
      <p className="small verdict-note">
        {pct(probs[mood], 0)} of the vote across 40 trees.{' '}
        {source.kind === 'track' ? <TrackNote track={source.track} mood={mood} /> : null}
      </p>
      <dl className="probs">
        {probs.map((p, k) => (
          <div key={k} className={k === mood ? 'prob is-top' : 'prob'}>
            <dt>{moodNames[k]}</dt>
            <dd>
              <span className="bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${p})` }} />
              </span>
              <span className="num">{pct(p, 0)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function TrackNote({ track, mood }: { track: Track; mood: number }) {
  const right = track.label === mood
  return (
    <span className="track-note">
      Dataset row {track.id.toLocaleString('en-US')} (no title in the data) is labelled{' '}
      {moodNames[track.label].toLowerCase()}:{' '}
      <span className={right ? 'hit' : 'miss'}>{right ? 'a hit.' : 'a miss.'}</span>
    </span>
  )
}

function Slider({
  index,
  value,
  line,
  onChange,
}: {
  index: number
  value: number
  line: Float32Array | null
  onChange: (v: number) => void
}) {
  const f = features[index]
  const id = `f-${f.key}`
  const path = useMemo(() => {
    if (!line) return null
    const n = line.length
    const pts = Array.from(line, (p, s) => `${((s / (n - 1)) * 100).toFixed(2)},${(30 - p * 28).toFixed(2)}`)
    return { line: `M${pts.join('L')}`, area: `M0,30L${pts.join('L')}L100,30Z` }
  }, [line])
  const shown = value.toFixed(f.digits)
  return (
    <li className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{f.name}</label>
        <output htmlFor={id} className="num">
          {shown}
          {f.unit ? ` ${f.unit}` : ''}
        </output>
      </div>
      <p className="small about" id={`${id}-about`}>
        {f.about} Importance {pct(importanceOf[f.key], 0)}.
      </p>
      <div className="track">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" className="spark">
          {path ? (
            <>
              <path d={path.area} className="spark-area" />
              <path d={path.line} className="spark-line" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        <input
          id={id}
          type="range"
          min={f.min}
          max={f.max}
          step={f.step}
          value={clamp(value, f.min, f.max)}
          style={
            { '--fill': `${((clamp(value, f.min, f.max) - f.min) / (f.max - f.min)) * 100}%` } as React.CSSProperties
          }
          aria-describedby={`${id}-about`}
          aria-valuetext={`${shown}${f.unit ? ` ${f.unit}` : ''}`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </li>
  )
}

// Each mood keeps one graphite tone on the map; the predicted mood's region is outlined in the accent.
const TONES = ['#1f2421', '#2b312d', '#3a423d', '#151816']
const ACCENT = '#3fdc85'
const SIZE = 36
const CELL = 12

function MoodMap({
  grid,
  x,
  mood,
  onMove,
}: {
  grid: Uint8Array | null
  x: number[]
  mood: number
  onMove: (v: number, e: number) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !grid) return
    const at = (r: number, c: number) => (r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : grid[r * SIZE + c])
    for (let i = 0; i < grid.length; i++) {
      ctx.fillStyle = TONES[grid[i]]
      ctx.fillRect((i % SIZE) * CELL, Math.floor(i / SIZE) * CELL, CELL, CELL)
    }
    // Trace the edge of the predicted mood's region, on the inside so the plot's outer edge is drawn too.
    ctx.fillStyle = ACCENT
    const w = 3
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (at(r, c) !== mood) continue
        const x0 = c * CELL
        const y0 = r * CELL
        if (at(r - 1, c) !== mood) ctx.fillRect(x0, y0, CELL, w)
        if (at(r + 1, c) !== mood) ctx.fillRect(x0, y0 + CELL - w, CELL, w)
        if (at(r, c - 1) !== mood) ctx.fillRect(x0, y0, w, CELL)
        if (at(r, c + 1) !== mood) ctx.fillRect(x0 + CELL - w, y0, w, CELL)
      }
  }, [grid, mood])

  // A label at the middle of each region big enough to hold one.
  const labels = useMemo(() => {
    if (!grid) return []
    const acc = [0, 1, 2, 3].map(() => ({ n: 0, r: 0, c: 0 }))
    grid.forEach((k, i) => {
      acc[k].n++
      acc[k].r += Math.floor(i / SIZE)
      acc[k].c += i % SIZE
    })
    return acc.flatMap((a, k) =>
      a.n >= 40 ? [{ k, left: ((a.c / a.n + 0.5) / SIZE) * 100, top: ((a.r / a.n + 0.5) / SIZE) * 100 }] : [],
    )
  }, [grid])

  const drag = (e: React.PointerEvent) => {
    if (e.type === 'pointerdown') (e.target as Element).setPointerCapture?.(e.pointerId)
    else if (!(e.buttons & 1)) return
    const rect = box.current!.getBoundingClientRect()
    onMove(clamp((e.clientX - rect.left) / rect.width, 0, 1), clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1))
  }

  return (
    <figure className="map">
      <div className="map-plot">
        <span className="axis axis-y small" aria-hidden="true">
          Energy
        </span>
        <div
          ref={box}
          className="map-box"
          onPointerDown={drag}
          onPointerMove={drag}
          role="img"
          aria-label={`Mood map over valence and energy. This song sits at valence ${x[V].toFixed(2)}, energy ${x[E].toFixed(2)}.`}
        >
          <canvas ref={canvas} width={SIZE * CELL} height={SIZE * CELL} />
          {labels.map((l) => {
            // Keep a label out from under the dot.
            const near = Math.hypot(l.left - x[V] * 100, l.top - (1 - x[E]) * 100) < 9
            const top = near ? l.top + (l.top > 80 ? -9 : 9) : l.top
            return (
              <span
                key={l.k}
                className={l.k === mood ? 'region-label is-top small' : 'region-label small'}
                style={{ left: `${clamp(l.left, 10, 90)}%`, top: `${clamp(top, 6, 94)}%` }}
                aria-hidden="true"
              >
                {moodNames[l.k].toLowerCase()}
              </span>
            )
          })}
          <span className="dot" style={{ left: `${x[V] * 100}%`, top: `${(1 - x[E]) * 100}%` }} aria-hidden="true" />
        </div>
        <span className="axis axis-x small" aria-hidden="true">
          Valence
        </span>
      </div>
      <figcaption className="small">
        What the forest would say if only valence and energy changed. Drag the dot to move both.
      </figcaption>
    </figure>
  )
}
