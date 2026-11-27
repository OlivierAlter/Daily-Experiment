#!/usr/bin/env node
// Zero-dependency static build. Reads experiments/*/ and writes dist/.
//   node build.mjs          build the site into dist/
//   node build.mjs --check  validate experiments only (used on pull requests)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'experiments');
const OUT = join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');
const site = JSON.parse(readFileSync(join(ROOT, 'site', 'site.json'), 'utf8'));

const SLUG = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THUMBS = ['thumb.jpg', 'thumb.png', 'thumb.webp'];
const MAX_HTML = 2 * 1024 * 1024, MAX_THUMB = 400 * 1024;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/* ---------- load and validate ---------- */
const errors = [];
const experiments = [];
for (const slug of readdirSync(SRC).sort()) {
  const dir = join(SRC, slug);
  if (!statSync(dir).isDirectory()) continue;
  const fail = m => errors.push(`experiments/${slug}: ${m}`);
  const m = SLUG.exec(slug);
  if (!m) { fail('folder must be named YYYY-MM-DD-short-name (lowercase letters, digits, hyphens)'); continue; }
  for (const f of ['index.html', 'meta.json', 'prompt.md']) if (!existsSync(join(dir, f))) fail(`missing ${f}`);
  if (errors.some(e => e.startsWith(`experiments/${slug}:`))) continue;
  let meta;
  try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch (e) { fail('meta.json is not valid JSON: ' + e.message); continue; }
  if (typeof meta.title !== 'string' || !meta.title.trim()) fail('meta.json needs a "title"');
  if (meta.date !== m[1]) fail(`meta.json "date" must be ${m[1]}, the date in the folder name`);
  for (const k of ['summary', 'medium', 'note', 'author', 'model', 'source']) if (meta[k] != null && typeof meta[k] !== 'string') fail(`meta.json "${k}" must be text`);
  if (meta.source && !/^https:\/\//.test(meta.source)) fail('meta.json "source" must be an https link');
  const prompt = readFileSync(join(dir, 'prompt.md'), 'utf8').trim();
  if (!prompt) fail('prompt.md is empty: the original prompt is required');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  if (Buffer.byteLength(html) > MAX_HTML) fail('index.html is over 2 MB');
  const thumb = THUMBS.find(f => existsSync(join(dir, f)));
  if (thumb && statSync(join(dir, thumb)).size > MAX_THUMB) fail(`${thumb} is over 400 KB`);
  experiments.push({ slug, dir, meta, prompt, html, thumb, order: Number(meta.order) || 0 });
}
experiments.sort((a, b) => a.meta.date.localeCompare(b.meta.date) || a.order - b.order || a.slug.localeCompare(b.slug));
experiments.forEach((e, i) => { e.no = i + 1; });

if (errors.length) { console.error('Problems found:\n- ' + errors.join('\n- ')); process.exit(1); }
if (CHECK) { console.log(`OK: ${experiments.length} experiments are valid.`); process.exit(0); }

/* ---------- the piece itself, served at /play/<slug>/ ---------- */
// Pieces are written as claude.ai artifacts. Outside claude.ai there is no window.claude,
// so this stand-in offers "downloads" (a plain browser download) and declines everything else;
// well-made pieces already fall back when a capability is missing.
const SHIM = `<script>(function(){if(window.claude)return;var caps={downloads:{save:function(o){var d=o&&o.data,b=d instanceof Blob?d:new Blob([d==null?'':d]),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(o&&o.filename)||'download';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},4000);return Promise.resolve()}}};window.claude={use:function(n){return caps[n]?Promise.resolve(caps[n]):Promise.reject(Object.assign(new Error('Not available outside claude.ai: '+n),{code:'unavailable'}))}}})();</script>`;
function playPage(e) {
  if (/<html[\s>]/i.test(e.html)) return /<head[^>]*>/i.test(e.html) ? e.html.replace(/<head[^>]*>/i, h => h + SHIM) : SHIM + e.html;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>html,body{margin:0;min-height:100%}</style>\n${SHIM}\n</head>\n<body>\n${e.html}\n</body>\n</html>\n`;
}

/* ---------- gallery pages ---------- */
const SANDBOX = 'allow-scripts allow-downloads allow-pointer-lock allow-modals';
const no = e => 'No. ' + String(e.no).padStart(2, '0');

function card(e) {
  const img = e.thumb
    ? `<img src="/e/${e.slug}/${e.thumb}" alt="" loading="lazy">`
    : `<span class="card-blank" aria-hidden="true">${esc(e.meta.title)}</span>`;
  return `<a class="card" href="/e/${e.slug}/">
      <span class="card-img">${img}</span>
      <span class="card-meta"><span>${no(e)}</span><span>${fmtDate(e.meta.date)}</span></span>
      <span class="card-title">${esc(e.meta.title)}</span>
      ${e.meta.medium ? `<span class="card-medium">${esc(e.meta.medium)}</span>` : ''}
    </a>`;
}

function page(e, isHome) {
  const newestFirst = [...experiments].reverse();
  const others = newestFirst.filter(x => x !== e);
  const prev = experiments[e.no - 2], next = experiments[e.no];
  const title = isHome ? site.name : `${e.meta.title} · ${site.name}`;
  const desc = e.meta.summary || site.tagline;
  const byline = [e.meta.author, e.meta.model].filter(Boolean).map(esc).join(' with ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${e.thumb ? `<meta property="og:image" content="/e/${e.slug}/${e.thumb}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="/">${esc(site.name)}</a>
  <span class="top-note">${esc(site.tagline)}</span>
</header>

<main>
  <section class="hero">
    <p class="eyebrow">${isHome ? '<span class="live">Today</span>' : ''}<span>${no(e)}</span><span>${fmtDate(e.meta.date)}</span></p>
    <div class="stage" id="stage">
      <iframe src="/play/${e.slug}/" title="${esc(e.meta.title)}, interactive piece" sandbox="${SANDBOX}" allow="fullscreen; autoplay" loading="eager"></iframe>
      <button class="touch" id="touch" type="button"><span>Touch to play</span></button>
    </div>
    <div class="label">
      <div class="label-main">
        <h1>${esc(e.meta.title)}</h1>
        ${e.meta.medium ? `<p class="medium">${esc(e.meta.medium)}</p>` : ''}
        ${e.meta.summary ? `<p class="summary">${esc(e.meta.summary)}</p>` : ''}
        ${e.meta.note ? `<p class="note"><span class="k">Claude's note</span>${esc(e.meta.note)}</p>` : ''}
        <p class="links">
          <a href="/play/${e.slug}/">Open full screen</a>
          ${e.meta.source ? `<a href="${esc(e.meta.source)}" rel="noopener">Original on claude.ai</a>` : ''}
        </p>
        ${byline ? `<p class="byline">${byline}</p>` : ''}
      </div>
      <div class="prompt">
        <p class="k">The prompt</p>
        <pre id="prompt">${esc(e.prompt)}</pre>
        <button class="more" id="more" type="button" hidden>Show the whole prompt</button>
      </div>
    </div>
    ${isHome ? '' : `<nav class="pager">${prev ? `<a href="/e/${prev.slug}/">Earlier: ${esc(prev.meta.title)}</a>` : '<span></span>'}${next ? `<a href="/e/${next.slug}/">Later: ${esc(next.meta.title)}</a>` : '<span></span>'}</nav>`}
  </section>

  ${others.length ? `<section class="archive">
    <h2>${isHome ? 'Earlier days' : 'All the days'}</h2>
    <div class="grid">
    ${others.map(card).join('\n    ')}
    </div>
  </section>` : ''}
</main>

<footer class="foot">
  <span>${esc(site.footer)}</span>
  ${site.repo ? `<a href="${esc(site.repo)}">Publish yours with a pull request</a>` : ''}
</footer>
<script>
(function(){
  var t=document.getElementById('touch'),s=document.getElementById('stage');
  t.addEventListener('click',function(){s.classList.add('on')});
  var p=document.getElementById('prompt'),m=document.getElementById('more');
  if(p.scrollHeight>p.clientHeight+8){m.hidden=false;m.addEventListener('click',function(){var o=p.classList.toggle('open');m.textContent=o?'Show less':'Show the whole prompt'})}
  else p.classList.add('open');
})();
</script>
</body>
</html>
`;
}

/* ---------- write ---------- */
rmSync(OUT, { recursive: true, force: true });
const write = (p, s) => { mkdirSync(dirname(join(OUT, p)), { recursive: true }); writeFileSync(join(OUT, p), s); };
copyFileSync(join(ROOT, 'site', 'style.css'), (mkdirSync(OUT, { recursive: true }), join(OUT, 'style.css')));
for (const e of experiments) {
  write(`play/${e.slug}/index.html`, playPage(e));
  write(`e/${e.slug}/index.html`, page(e, false));
  if (e.thumb) copyFileSync(join(e.dir, e.thumb), join(OUT, 'e', e.slug, e.thumb));
}
const latest = experiments[experiments.length - 1];
write('index.html', latest ? page(latest, true) : `<!doctype html><title>${esc(site.name)}</title><p>No experiments yet.</p>`);
write('experiments.json', JSON.stringify(experiments.map(e => ({ no: e.no, slug: e.slug, ...e.meta, prompt: e.prompt, url: `/e/${e.slug}/`, play: `/play/${e.slug}/` })), null, 2));
console.log(`Built ${experiments.length} experiments into dist/. Home shows "${latest?.meta.title}".`);
