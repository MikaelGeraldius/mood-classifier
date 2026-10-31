import { useEffect, useState } from 'react'
import Classifier from './components/Classifier'
import Results from './components/Results'
import { parseForest, type Forest } from './forest'
import { full, m, pct, project, thousands, web } from './content'

export default function App() {
  const [forest, setForest] = useState<Forest | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          Song mood
        </a>
        <nav aria-label="Sections">
          <a href="#try">Try it</a>
          <a href="#results">Results</a>
          <a href="#method">Method</a>
          <a href="#learned">Learned</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="top" data-tone="ground" aria-labelledby="title">
          <h1 id="title">{project.title}</h1>
          <div className="hero-foot">
            <p className="lead">
              A Random Forest trained on {thousands(m.rows)} Spotify songs reads nine audio features and names the mood:
              sad, happy, energetic or calm. It runs here, in your browser, with nothing sent anywhere.
            </p>
            <a className="button" href="#try">
              Try it
            </a>
          </div>
          <p className="small hero-credit">{project.course}. Group 3.</p>
        </section>

        <Classifier forest={forest} error={error} />
        <Results />

        <section className="chapter method" id="method" data-tone="raised" aria-labelledby="method-title">
          <div className="intro">
            <h2 id="method-title">How it was made</h2>
            <p className="lead">The notebook’s pipeline, step by step, and what changed for the web.</p>
          </div>
          <dl className="steps">
            <div>
              <dt>Data</dt>
              <dd>
                <a href={project.dataset.url}>{project.dataset.name}</a> by {project.dataset.by}. Each song has
                Spotify’s audio features and one of four mood labels: {thousands(m.classCounts.sad)} sad,{' '}
                {thousands(m.classCounts.happy)} happy, {thousands(m.classCounts.energetic)} energetic and{' '}
                {thousands(m.classCounts.calm)} calm.
              </dd>
            </div>
            <div>
              <dt>Features</dt>
              <dd>
                The nine raw audio features, with no feature engineering: danceability, energy, loudness, speechiness,
                acousticness, instrumentalness, liveness, valence and tempo.
              </dd>
            </div>
            <div>
              <dt>Split</dt>
              <dd>
                80% to train, 20% to test, stratified so both halves keep the same mix of moods (
                {thousands(m.trainRows)} and {thousands(m.testRows)} songs).
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>
                scikit-learn’s RandomForestClassifier: {full.trees} trees, max depth {full.depth}, at least 5 songs to
                split and 2 per leaf, √9 features tried per split, balanced class weights.
              </dd>
            </div>
            <div>
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
            <h2 id="learned-title">What I learned</h2>
            <p className="lead">
              The headline number was the easy part. These are the things that changed how I read it.
            </p>
          </div>
          <ul className="lessons">
            <li>
              <h3>A score needs a baseline beside it</h3>
              <p>
                {pct(full.accuracy)} sounds strong on its own. Always answering “happy” already gets{' '}
                {pct(m.baselineMajority)}, and a plain logistic regression gets {pct(m.baselineLogReg)}. The forest’s
                real contribution is the nine or so points it adds over a linear model, which is still worth having, and
                a more honest thing to claim.
              </p>
            </li>
            <li>
              <h3>Check what a cleaning step actually did</h3>
              <p>
                The notebook calls <code>drop_duplicates()</code>, and it removed {m.notebookDropDuplicatesRemoved}{' '}
                rows: the CSV’s index column makes every line unique. Compared on the features,{' '}
                {thousands(m.duplicateSongs)} songs are exact repeats, and {m.testRowsAlsoInTrain} test songs have a
                twin in the training set. Small here, but it is how a test set quietly leaks.
              </p>
            </li>
            <li>
              <h3>Valence was not the axis I expected</h3>
              <p>
                Psychology’s circumplex model puts mood on two axes, valence and energy, so I expected valence to
                matter. It carries under 5% of the importance, and valence with energy alone reaches only{' '}
                {pct(m.valenceEnergyAccuracy)}. Texture does the work: instrumentalness, energy and acousticness on
                their own reach {pct(m.top3Accuracy)}. Drag the dot on the map left and right and the mood barely moves.
              </p>
            </li>
            <li>
              <h3>The mistakes have a shape</h3>
              <p>
                Most errors are between neighbours. Happy and energetic swap the most ({thousands(full.confusion[1][2])}{' '}
                one way, {thousands(full.confusion[2][1])} the other): both are loud, bright and danceable. Calm is the
                easiest mood at 0.97 recall, because calm songs are quiet, acoustic and often wordless, a corner no
                other mood shares.
              </p>
            </li>
            <li>
              <h3>Trees don’t need scaling</h3>
              <p>
                The notebook z-scores every feature first. A decision tree only asks “is this above a threshold?”, so
                rescaling moves the thresholds, not the answers. Dropping it means the browser reads raw values and has
                one less thing to ship and keep in sync.
              </p>
            </li>
            <li>
              <h3>Shipping a model is a size problem</h3>
              <p>
                The 500-tree, depth-20 forest has {thousands(full.nodes)} nodes: far too big for a web page. Forty trees
                of depth 14 have {thousands(web.nodes)}, load in about 1.4 MB, and lose about one point of accuracy.
                Most of a big forest’s size buys very little.
              </p>
            </li>
            <li>
              <h3>Features you can’t fetch any more</h3>
              <p>
                Spotify closed its audio-features endpoint to new apps in November 2024, so this page can’t look a song
                up by name. You set the nine numbers yourself, or load a real song from the test set. Building on a
                third-party API means planning for it to change.
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
