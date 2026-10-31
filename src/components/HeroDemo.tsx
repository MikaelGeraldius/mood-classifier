import { useEffect, useMemo, useRef, useState } from 'react'
import { argmax, predict, type Forest } from '../forest'
import { features, moodNames, pct, sampleTracks } from '../content'
import { useReducedMotion } from '../hooks'

const HOLD = 3600

/**
 * The first screen's live thing: songs from the test set play through one after another, the way a player
 * moves down a queue, and the forest votes on each. The nine bars are that song's features.
 */
export default function HeroDemo({ forest }: { forest: Forest | null }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [visible, setVisible] = useState(true)
  const card = useRef<HTMLDivElement>(null)
  const track = sampleTracks[index % sampleTracks.length]
  const probs = useMemo(() => (forest ? Array.from(predict(forest, track.f)) : null), [forest, track])
  const mood = probs ? argmax(probs) : -1
  const running = playing && !reduced && visible && !!forest

  useEffect(() => {
    const el = card.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden))
    io.observe(el)
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const t = window.setTimeout(() => setIndex((i) => i + 1), HOLD)
    return () => window.clearTimeout(t)
  }, [running, index])

  return (
    <div className="demo" ref={card} aria-label="The forest classifying songs from the test set">
      <div className="demo-bars" aria-hidden="true">
        {features.map((f, i) => (
          <span
            key={f.key}
            style={{ transform: `scaleY(${Math.max(0.04, (track.f[i] - f.min) / (f.max - f.min))})` }}
            title={f.name}
          />
        ))}
      </div>
      <div className="demo-meta">
        <p className="demo-verdict" key={`${index}-${mood}`} aria-live="polite">
          {mood >= 0 ? moodNames[mood] : 'Loading'}
        </p>
        <p className="small demo-caption">
          Dataset row {track.id.toLocaleString('en-US')}, labelled {moodNames[track.label].toLowerCase()}
        </p>
      </div>
      <dl className="probs demo-probs">
        {moodNames.map((name, k) => (
          <div key={name} className={k === mood ? 'prob is-top' : 'prob'}>
            <dt>{name}</dt>
            <dd>
              <span className="bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${probs ? probs[k] : 0})` }} />
              </span>
              <span className="num">{probs ? pct(probs[k], 0) : ''}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="demo-foot">
        <span className="progress" aria-hidden="true">
          <span key={index} className={running ? 'is-running' : undefined} style={{ animationDuration: `${HOLD}ms` }} />
        </span>
        {reduced ? (
          <button type="button" className="icon-button" onClick={() => setIndex((i) => i + 1)} aria-label="Next song">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5l9 7-9 7V5zM17 5v14" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="icon-button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause the queue' : 'Play the queue'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {playing ? <path d="M8 5v14M16 5v14" /> : <path d="M7 5l12 7-12 7V5z" />}
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
