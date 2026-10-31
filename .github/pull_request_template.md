## What this changes

<!-- One or two sentences. Which tool, which panel, which path? -->

## Why

<!-- What was wrong, or what was missing. What did you see before the change? -->

## How it was checked

- [ ] Ran `node --check lib/client.js` and `node --check lib/index.js`
- [ ] Installed the change into a profile and **fully reopened the host**
- [ ] Dragged with each affected tool and looked at the result
- [ ] Undo, redo and clear still behave
- [ ] Sent once, confirmed the composite and the note list landed in the conversation

## Scope

- [ ] This is annotation behaviour, not image editing (no eraser, background removal, resize, download or zoom)
- [ ] If behaviour changed, `CHANGELOG.md` has a line under the right version
- [ ] The three names still agree: `package.json` name, `cordis.patch.yml` name, the `id` in `lib/client.js`
