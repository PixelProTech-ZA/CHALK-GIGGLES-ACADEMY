# Chalk & Giggles Academy — Phase 1 prototype
*Learning without the classroom pressure.*

Files
All files sit flat in one folder (no subfolders):
- `index.html` — the classroom (robot, chalkboard, chat, speech).
- `manifest.webmanifest`, `sw.js`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — installable PWA (Android "Install app", offline shell). Upload all of these together to GitHub Pages (needs https).
- `worker.js` + `wrangler.toml` — Cloudflare Worker that talks to OpenRouter. The API key stays here. Deploy separately; it does not go on Pages.

## Deploy
1. `npm i -g wrangler`, then in this folder: `npx wrangler secret put OPENROUTER_API_KEY` (paste your key).
2. Edit `OPENROUTER_MODEL` and `ALLOWED_ORIGIN` in `wrangler.toml`.
3. `npx wrangler deploy` and copy the `*.workers.dev` URL.
4. Open `index.html`, tap **Start class**, tap the red backend chip, paste the Worker URL, **Save & test**.

## What works in this build
- All grades 1–12 and all subjects from your master prompt are selectable by phase; teaching style follows the grade (playful 1–3, clever 4–7, professor 8–12).
- Teacher voice: "Old dad" preset (deep, calm), plus friendly and bright presets, a voice picker, speed and depth sliders, sentence-by-sentence pacing. Quality depends on voices installed on the device; a studio cloud voice is a later API step.
- Original robot (Professor Klank) with states: walk, talk, gesture, point, write, think, confused, smile, laugh, celebrate, excited.
- Structured lesson JSON validated in the Worker **and** again in the browser before display.
- Speech (browser speech synthesis) + mouth movement + chalk-writing animation run per action, so what is said is what is written. Text lesson always appears in chat if voice or board fails.
- KaTeX maths, balance-scale and number-line visuals, erase/highlight, earlier-board history.
- Teach, Practice, typed Homework, Ask; answer checking with verdict and mistake type; Easy/Steady/Challenge pace.
- Hand-written demo lesson (labelled, no AI) so you can see the classroom without a backend.

## Not built yet (labelled in the UI)
Curriculum documents + RAG + source references, photo/OCR homework, accounts and cloud progress, parental controls, admin area, Exam prep, Revision, Grades 1–7 and 10–12, other subjects. Mistake log is stored only on the device (localStorage). Rate limiting is best-effort in-memory; add Cloudflare's Rate Limiting binding before public launch. No POPIA compliance claim is made; needs legal review.

## Acceptance tests status
1 (OpenRouter answers) and 13 (AI failure handling) need your deployed Worker to verify. 3, 4, 7 work in the browser. 6, 10, 14 are not met yet.
