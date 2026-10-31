# Contributing

Thanks for looking. This is a small plugin — one hand-written client bundle, no build step — so the loop is short.

## Where the code lives

| Path | What it is |
| --- | --- |
| `lib/client.js` | Everything that runs in the browser: the layer, the toolbar, the tools, the send path. Hand-written CommonJS wrapped in `window.__ModuleLoader__.load`. No bundler, no TypeScript. |
| `lib/index.js` | The Node-side half. It is deliberately an empty shell. |
| `cordis.patch.yml` | The single insert that puts the plugin into a profile. |
| `docs/panel.png` | The screenshot used by the README. |

## Try a change locally

```bash
git clone https://github.com/HuaLQIn/dsh-sidebar-annotate.git
dsh plugin --profile <your-profile> add "<path to the clone>"
```

Then **fully quit and reopen the host** — the client bundle is composed at boot, so reloading the window does not pick up a change.

## Before opening a pull request

Run these; all four must come back clean.

```bash
node --check lib/client.js          # syntax
node --check lib/index.js
grep -rn "@local" . | wc -l          # must be 0
grep -rn -e "D:\\" -e "C:\\Users" -e "DeepSeekHarness" . | wc -l   # must be 0
```

Then check the three names still agree — `package.json` → `name`, `cordis.patch.yml` → `name`, and the `id` in `lib/client.js`. If one drifts, the plugin silently fails to load.

## What a good pull request looks like

- One change per pull request, with the reasoning in the description.
- Say what you tried before the change and what you saw after — a screenshot of the toolbar is worth more than a paragraph.
- Keep the visual language consistent with the panel that is already there. The reference is documented at the end of the README.
- If you change behaviour, add a line under the right version in `CHANGELOG.md`.

## What this plugin deliberately does not do

Eraser, background removal, resize, download, zoom — those belong to image editing, not annotation. Pull requests adding them will be declined; that is a scope decision, not a judgement on the code.

## Reporting a bug

Use the issue form. It asks for the host version and the exact steps, which is what decides whether a report can be reproduced at all.
