# ReccoBeats proxy (Cloudflare Worker)

The live site calls ReccoBeats from the visitor's browser. If ReccoBeats doesn't send CORS headers, the browser
refuses the reply and the page says the request was blocked. This Worker forwards the requests (ReccoBeats, plus
Spotify's oEmbed, embed page and 30-second preview audio for when ReccoBeats is down) and adds the header, for the origins in `ALLOWED_ORIGINS` only (GitHub Pages and the local dev server). It stores nothing.
The free Workers plan (100,000 requests a day) is plenty.

## Deploy once

```bash
cd proxy
npx wrangler login
npx wrangler deploy
```

`deploy` prints the Worker's address, like `https://mood-proxy.<your-subdomain>.workers.dev`.

## After changing worker.js

Run `npx wrangler deploy` again from this folder.

## Point the site at it

The address is in `src/config.ts` (`PROXY_URL`). It's public, not a secret, so it is committed with the code.
If you deploy the Worker under another name, change it there and push. No GitHub settings are needed.

To check the Worker: `curl -H "Origin: https://mikaelgeraldius.github.io" "https://mood-proxy.<you>.workers.dev/v1/track?ids=4uLU6hMCjMI75M1A2tKUQC"`
should print JSON.

`npm run dev` doesn't need the Worker: Vite's dev server proxies the same paths (`vite.config.ts`).
If the site moves to another domain, add it to `ALLOWED_ORIGINS` and deploy again.
