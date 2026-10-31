/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Cloudflare Worker in proxy/, e.g. https://mood-proxy.<you>.workers.dev. Unset: call ReccoBeats directly. */
  readonly VITE_RECCOBEATS_PROXY?: string
}
