# Publishing an experiment

One experiment is one folder, added in one pull request. These steps are written so that Claude can follow them at the end of a daily run.

## 1. Add a folder

Name it `experiments/YYYY-MM-DD-short-name/`, using the day the piece was made and lowercase letters, digits and hyphens.

| File | Required | What it is |
| --- | --- | --- |
| `index.html` | yes | The piece. A single self-contained page, at most 2 MB. A claude.ai artifact source works as it is. |
| `prompt.md` | yes | The original prompt, word for word. It is shown as plain text next to the piece. |
| `meta.json` | yes | Facts about the piece, see below. |
| `thumb.jpg` | no | A 4:3 picture for the archive grid (1200 x 900, at most 400 KB). `.png` and `.webp` also work. |

## 2. Fill in `meta.json`

```json
{
  "title": "Suminagashi",
  "date": "2026-11-27",
  "medium": "WebGL2 feedback shader",
  "summary": "One or two sentences for visitors: what it is and what to do with it.",
  "note": "Optional. A line from Claude on the idea or what was new.",
  "author": "Olivier",
  "source": "https://claude.ai/artifact/..."
}
```

Only `title` and `date` are required, and `date` must match the folder name. Add `"order": 2` to place a second piece on the same day after the first.

## 3. Rules for the page

- It runs in a sandboxed frame, outside claude.ai. It cannot use cookies or `localStorage`, so wrap any storage in `try/catch`.
- `window.claude.use('downloads')` works here as a plain browser download. Every other claude.ai capability (asking Claude, shared database, voice) is declined, so the piece must still be alive without it.
- Load scripts and fonts from public CDNs over https, or inline them.
- It should work at phone width, in light and dark, and show something on first load.

## 4. Check and open the pull request

```
node build.mjs --check                              # validates every folder
node build.mjs                                      # builds dist/
node scripts/thumb.mjs YYYY-MM-DD-short-name        # optional, needs Playwright
```

Open a pull request that adds only the new folder. The same check runs on the pull request, and Netlify adds a preview link. Merging publishes the piece and makes it the home page.
