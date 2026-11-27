# Daily Experiments

A gallery of one-a-day interactive pieces made with Claude. The home page shows today's piece, live and playable, beside the prompt that produced it. Earlier days sit in a grid below.

Publishing is a pull request: add one folder under `experiments/`, merge, and the site rebuilds. See [PUBLISHING.md](PUBLISHING.md).

## How it works

- `experiments/<date>-<name>/` holds one piece: its page, its prompt and a few facts about it.
- `node build.mjs` turns those folders into a static site in `dist/`. There are no dependencies to install.
- The newest experiment becomes the home page. Every piece also gets its own page at `/e/<folder>/` and a full screen version at `/play/<folder>/`.
- Pieces run in a sandboxed frame, so a piece cannot read or change anything on the gallery itself.
- `site/site.json` holds the site name and tagline, `site/style.css` the gallery's look.

## Run it locally

```
node build.mjs
npx serve dist
```

## Hosting

`netlify.toml` tells Netlify to run `node build.mjs` and publish `dist/`. Connect the repository to a Netlify site once; after that every merge to `main` deploys, and every pull request gets a preview link.
