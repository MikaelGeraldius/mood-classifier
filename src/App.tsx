import { useEffect, useState } from 'react'
import Classifier from './components/Classifier'
import HeroDemo from './components/HeroDemo'
import Results from './components/Results'
import { parseForest, type Forest } from './forest'
import { full, m, pct, project, thousands, web } from './content'
import { useReducedMotion, useRevealOnScroll, useSmoothAnchors, useSmoothScroll } from './hooks'

export default function App() {
  const [forest, setForest] = useState<Forest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reduced = useReducedMotion()
  useSmoothScroll(reduced)
  useSmoothAnchors()
  useRevealOnScroll()

  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}forest.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => live && setForest(parseForest(buf)))
      .catch((e: Error) => live && setError(`Reload to try again (${e.message}).`))
    return () => {
      live = false
    }
  }, [])

  return (
    <>
      <a className="skip-link" href="#try">
        Skip to the classifier
      </a>
      <header className="site-header">
        <a href="#top" className="wordmark">
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="13" fill="var(--accent)" />
            <path
              d="M7 15v3M10.3 11v7M13.6 8v10M16.9 12v6M20 14v4"
              stroke="var(--accent-ink)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Song mood
        </a>
        <nav aria-label="Sections">
          <a href="#try">Check a song</a>
          <a href="#results">Results</a>
          <a href="#method">Method</a>
          <a href="#learned">Learned</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="top" data-tone="ground" aria-labelledby="title">
          <div className="hero-text">
            <h1 id="title">{project.title}</h1>
            <p className="lead">
              Paste a Spotify link or upload a song. A Random Forest trained on {thousands(m.rows)} songs reads nine
              audio features and names the mood: sad, happy, energetic or calm.
            </p>
            <div className="hero-actions">
              <a className="button" href="#try">
                Check a song
              </a>
              <a className="button button-quiet" href="#results">
                See how well it works
              </a>
            </div>
            <p className="small hero-credit">{project.course}. Group 3.</p>
          </div>
          <HeroDemo forest={forest} />
        </section>

        <Classifier forest={forest} error={error} />
        <Results />

        <section className="chapter method" id="method" data-tone="raised" aria-labelledby="method-title">
          <div className="intro">
            <h2 id="method-title" className="reveal" data-reveal>
              How it was made
            </h2>
            <p className="lead reveal" data-reveal>
              The notebook’s pipeline, step by step, and what changed for the web.
            </p>
          </div>
          <dl className="steps">
            <div className="reveal" data-reveal>
              <dt>Data</dt>
              <dd>
                <a href={project.dataset.url}>{project.dataset.name}</a> by {project.dataset.by}. Each song has
                Spotify’s audio features and one of four mood labels: {thousands(m.classCounts.sad)} sad,{' '}
                {thousands(m.classCounts.happy)} happy, {thousands(m.classCounts.energetic)} energetic and{' '}
                {thousands(m.classCounts.calm)} calm.
              </dd>
            </div>
            <div className="reveal" data-reveal>
              <dt>Features</dt>
              <dd>
                The nine raw audio features, with no feature engineering: danceability, energy, loudness, speechiness,
                acousticness, instrumentalness, liveness, valence and tempo.
              </dd>
            </div>
            <div className="reveal" data-reveal>
              <dt>Split</dt>
              <dd>
                80% to train, 20% to test, stratified so both halves keep the same mix of moods (
                {thousands(m.trainRows)} and {thousands(m.testRows)} songs).
              </dd>
            </div>
            <div className="reveal" data-reveal>
              <dt>Model</dt>
              <dd>
                scikit-learn’s RandomForestClassifier: {full.trees} trees, max depth {full.depth}, at least 5 songs to
                split and 2 per leaf, √9 features tried per split, balanced class weights.
              </dd>
            </div>
            <div className="reveal" data-reveal>
              <dt>On this page</dt>
              <dd>
                The same settings with {web.trees} trees and depth {web.maxDepth}, trained on unscaled features. Its{' '}
                {thousands(web.nodes)} nodes are packed into a {(web.bytes / 1e6).toFixed(1)} MB binary that a small
                TypeScript reader walks. On 2,000 test songs it agrees with scikit-learn{' '}
                {pct(web.quantisedAgreement, 2)} of the time.
              </dd>
            </div>
          </dl>
        </section>

        <section className="chapter learned" id="learned" data-tone="deep" aria-labelledby="learned-title">
          <div className="intro">
            <h2 id="learned-title" className="reveal" data-reveal>
              What I learned
            </h2>
            <p className="lead reveal" data-reveal>
              The headline number was the easy part. These are the things that changed how I read it.
            </p>
          </div>
          <ul className="lessons">
            <li className="reveal" data-reveal>
              <h3>A score needs a baseline beside it</h3>
              <p>
                {pct(full.accuracy)} sounds strong on its own. Always answering “happy” already gets{' '}
                {pct(m.baselineMajority)}, and a plain logistic regression gets {pct(m.baselineLogReg)}. The forest’s
                real contribution is the nine or so points it adds over a linear model, which is still worth having, and
                a more honest thing to claim.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>Check what a cleaning step actually did</h3>
              <p>
                The notebook calls <code>drop_duplicates()</code>, and it removed {m.notebookDropDuplicatesRemoved}{' '}
                rows: the CSV’s index column makes every line unique. Compared on the features,{' '}
                {thousands(m.duplicateSongs)} songs are exact repeats, and {m.testRowsAlsoInTrain} test songs have a
                twin in the training set. Small here, but it is how a test set quietly leaks.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>Valence was not the axis I expected</h3>
              <p>
                Psychology’s circumplex model puts mood on two axes, valence and energy, so I expected valence to
                matter. It carries under 5% of the importance, and valence with energy alone reaches only{' '}
                {pct(m.valenceEnergyAccuracy)}. Texture does the work: instrumentalness, energy and acousticness on
                their own reach {pct(m.top3Accuracy)}. Drag the dot on the map left and right and the mood barely moves.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>The mistakes have a shape</h3>
              <p>
                Most errors are between neighbours. Happy and energetic swap the most ({thousands(full.confusion[1][2])}{' '}
                one way, {thousands(full.confusion[2][1])} the other): both are loud, bright and danceable. Calm is the
                easiest mood at 0.97 recall, because calm songs are quiet, acoustic and often wordless, a corner no
                other mood shares.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>Trees don’t need scaling</h3>
              <p>
                The notebook z-scores every feature first. A decision tree only asks “is this above a threshold?”, so
                rescaling moves the thresholds, not the answers. Dropping it means the browser reads raw values and has
                one less thing to ship and keep in sync.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>Shipping a model is a size problem</h3>
              <p>
                The 500-tree, depth-20 forest has {thousands(full.nodes)} nodes: far too big for a web page. Forty trees
                of depth 14 have {thousands(web.nodes)}, load in about 1.4 MB, and lose about one point of accuracy.
                Most of a big forest’s size buys very little.
              </p>
            </li>
            <li className="reveal" data-reveal>
              <h3>Features you can’t fetch any more</h3>
              <p>
                Spotify closed its audio-features endpoint to new apps in November 2024, so the model’s own inputs
                became hard to get. This page asks ReccoBeats instead, which measures the same nine features on the same
                scales, from a Spotify link or straight from an audio file. Building on a third-party API means planning
                for it to change, and for it to be down: if it can’t be reached, the page measures loudness, tempo and
                energy itself and says so.
              </p>
            </li>
          </ul>
        </section>
      </main>

      <footer className="site-footer" data-tone="ground">
        <p className="small">
          Group 3: {project.team.join(', ')}. Report and notebook in Indonesian. Data:{' '}
          <a href={project.dataset.url}>Moodify on Kaggle</a>.
        </p>
      </footer>
    </>
  )
}
