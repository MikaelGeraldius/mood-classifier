import { useState } from 'react'
import { features, featureKeys, full, m, moodNames, pct, thousands, web } from '../content'

type Which = 'full' | 'web'

export default function Results() {
  const [which, setWhich] = useState<Which>('full')
  const data =
    which === 'full'
      ? { confusion: full.confusion, perClass: full.perClass, importance: full.importance }
      : {
          confusion: web.confusion,
          perClass: web.perClass,
          importance: Object.entries(web.importance) as [string, number][],
        }
  const nameOf = (key: string) => features[featureKeys.indexOf(key)].name

  return (
    <section className="chapter results" id="results" data-tone="ground" aria-labelledby="results-title">
      <div className="intro">
        <h2 id="results-title" className="reveal" data-reveal>
          How often it is right
        </h2>
        <p className="lead reveal" data-reveal>
          Tested on {thousands(m.testRows)} songs the model never saw, a fifth of the dataset held out with the mood mix
          kept the same.
        </p>
      </div>

      <dl className="facts">
        <div className="reveal" data-reveal>
          <dt className="small">Full model in the notebook, 500 trees</dt>
          <dd className="numeral">{pct(full.accuracy, 1)}</dd>
        </div>
        <div className="reveal" data-reveal>
          <dt className="small">The 40-tree model on this page</dt>
          <dd className="numeral">{pct(web.accuracy, 1)}</dd>
        </div>
        <div className="reveal" data-reveal>
          <dt className="small">Logistic regression, same split</dt>
          <dd className="numeral">{pct(m.baselineLogReg, 1)}</dd>
        </div>
        <div className="reveal" data-reveal>
          <dt className="small">Always answering “happy”</dt>
          <dd className="numeral">{pct(m.baselineMajority, 1)}</dd>
        </div>
      </dl>

      <fieldset className="chips which">
        <legend className="small">Show the details for</legend>
        <button type="button" className="chip" aria-pressed={which === 'full'} onClick={() => setWhich('full')}>
          the full model
        </button>
        <button type="button" className="chip" aria-pressed={which === 'web'} onClick={() => setWhich('web')}>
          this page’s model
        </button>
      </fieldset>

      <div className="result-grid">
        <div className="block reveal" data-reveal>
          <h3>Where it gets confused</h3>
          <p className="small">
            Each row is a song’s real mood; each column is what the model called it. The squares grow with the share of
            the row.
          </p>
          <Confusion matrix={data.confusion} />
        </div>

        <div className="block reveal" data-reveal>
          <h3>Per mood</h3>
          <p className="small">
            Precision: of the songs it called this mood, how many were. Recall: of the songs that were, how many it
            found.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Mood</th>
                <th scope="col">Precision</th>
                <th scope="col">Recall</th>
                <th scope="col">F1</th>
              </tr>
            </thead>
            <tbody>
              {data.perClass.map((c, k) => (
                <tr key={k}>
                  <th scope="row">{moodNames[k]}</th>
                  <td className="num">{c.precision.toFixed(2)}</td>
                  <td className="num">{c.recall.toFixed(2)}</td>
                  <td className="num">{c.f1.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="block wide reveal" data-reveal>
          <h3>What it listens to</h3>
          <p className="small">
            Feature importance: how much each feature’s splits cleaned up the moods, summed over the forest.
          </p>
          <ul className="importance">
            {data.importance.map(([key, v]) => (
              <li key={key}>
                <span>{nameOf(key)}</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${v / data.importance[0][1]})` }} />
                </span>
                <span className="num">{pct(v, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Confusion({ matrix }: { matrix: number[][] }) {
  return (
    <table className="table confusion">
      <caption className="visually-hidden">
        Confusion matrix: rows are the labelled mood, columns the predicted mood.
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">Labelled mood</span>
          </th>
          {moodNames.map((n) => (
            <th scope="col" key={n}>
              {n}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, r) => {
          const total = row.reduce((a, b) => a + b, 0)
          return (
            <tr key={r}>
              <th scope="row">{moodNames[r]}</th>
              {row.map((v, c) => {
                const share = v / total
                return (
                  <td
                    key={c}
                    className={r === c ? 'cell is-diag' : 'cell'}
                    title={`${thousands(v)} of ${thousands(total)} ${moodNames[r].toLowerCase()} songs called ${moodNames[c].toLowerCase()} (${pct(share)})`}
                  >
                    <span className="sq" aria-hidden="true">
                      <span style={{ transform: `scale(${Math.max(Math.sqrt(share), 0.06)})` }} />
                    </span>
                    <span className="num">{thousands(v)}</span>
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
