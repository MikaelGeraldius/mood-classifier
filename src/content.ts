import metrics from './data/metrics.json'
import tracks from './data/tracks.json'

/** Every fact on the page. Numbers come from the notebook's output or from ml/train_export.py (metrics.json). */

export const project = {
  title: 'What mood is this song?',
  course: 'Final project, Machine Learning, Universitas Multimedia Nusantara, 2026',
  team: ['Alto Dev', 'Claudia Wiyadi Gunawan', 'Gerald Fedorian', 'Mikael Geraldius Gunawan', 'Nadine Kay Ludony'],
  author: 'Mikael Geraldius Gunawan',
  dataset: {
    name: 'Moodify, 278k emotion-labelled Spotify songs',
    by: 'Abdullah Orzan, Kaggle',
    url: 'https://www.kaggle.com/datasets/abdullahorzan/moodify-dataset',
  },
}

export interface Feature {
  key: string
  name: string
  about: string
  min: number
  max: number
  step: number
  unit?: string
  digits: number
}

// Plain-language meanings, from Table I of the report and Spotify's audio-features reference.
const about: Record<string, [string, string]> = {
  danceability: ['Danceability', 'How well the rhythm suits dancing: tempo, beat strength, regularity.'],
  energy: ['Energy', 'Intensity and activity. Fast, loud and noisy scores high.'],
  loudness: ['Loudness', 'Average loudness of the whole track.'],
  speechiness: ['Speechiness', 'How much of it is spoken words: rap, podcasts, spoken word.'],
  acousticness: ['Acousticness', 'Confidence the track is acoustic rather than electronic.'],
  instrumentalness: ['Instrumentalness', 'Likelihood the track has no vocals.'],
  liveness: ['Liveness', 'Likelihood an audience is in the recording.'],
  valence: ['Valence', 'Musical positiveness. High sounds cheerful, low sounds sombre.'],
  tempo: ['Tempo', 'Speed in beats per minute.'],
}

/** Feature order the model was trained on. The sliders are shown in importance order instead. */
export const featureKeys: string[] = tracks.features

export const features: Feature[] = featureKeys.map((key) => {
  const [name, text] = about[key]
  if (key === 'loudness') return { key, name, about: text, min: -36, max: 0, step: 0.1, unit: 'dB', digits: 1 }
  if (key === 'tempo') return { key, name, about: text, min: 60, max: 200, step: 1, unit: 'BPM', digits: 0 }
  return { key, name, about: text, min: 0, max: 1, step: 0.01, digits: 2 }
})

export const moodNames = ['Sad', 'Happy', 'Energetic', 'Calm'] as const

/** The median song of each mood in the training split: the presets. */
export const presets: number[][] = tracks.moods.map((m) => (tracks.medians as Record<string, number[]>)[m])

export interface Track {
  id: number
  label: number
  f: number[]
}
export const sampleTracks: Track[] = tracks.samples

// ---- Results

/** The full model as reported in the notebook: 500 trees, max_depth 20. */
export const full = {
  trees: 500,
  depth: 20,
  accuracy: 0.9228,
  perClass: [
    { precision: 0.93, recall: 0.91, f1: 0.92, support: 16412 },
    { precision: 0.92, recall: 0.92, f1: 0.92, support: 21286 },
    { precision: 0.89, recall: 0.9, f1: 0.9, support: 9413 },
    { precision: 0.95, recall: 0.97, f1: 0.96, support: 8477 },
  ],
  confusion: [
    [15008, 790, 205, 409],
    [789, 19612, 838, 47],
    [117, 795, 8493, 8],
    [240, 49, 3, 8185],
  ],
  importance: [
    ['instrumentalness', 0.240563],
    ['energy', 0.233609],
    ['acousticness', 0.174004],
    ['loudness', 0.116318],
    ['danceability', 0.092467],
    ['speechiness', 0.055868],
    ['valence', 0.048576],
    ['tempo', 0.023661],
    ['liveness', 0.014936],
  ] as [string, number][],
  nodes: 9246642,
}

export const web = metrics.web
export const m = metrics

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`
export const thousands = (v: number) => v.toLocaleString('en-US')

/** Slider order: most important first, so the controls that matter most come first. */
export const sliderOrder: number[] = full.importance.map(([key]) => featureKeys.indexOf(key))
export const importanceOf = Object.fromEntries(full.importance)
