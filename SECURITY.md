# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.6.x | Yes |
| 0.5.x and older | No — please upgrade |

## What this plugin can reach

Worth knowing before you report, because it explains what counts as a vulnerability here:

- It reads image bytes through the host's own `/api/file` endpoint, for the file already open in the sidebar.
- It writes one thing into the conversation: a composited PNG plus a text block, through the host's public draft API.
- It stores no data of its own. No network calls to anywhere but the host. No telemetry.
- It registers a single slot in the sidebar and a portal layer on `document.body`.

So the interesting attack surface is narrow: what happens when the image is hostile, or when the surrounding page changes under the layer.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting: go to the **Security** tab of this repository → **Report a vulnerability**. That opens a private advisory only the maintainer can see.

Include: what you did, what happened, the host version, and — if you can — the smallest image or sequence that reproduces it.

## What to expect

- Acknowledgement within 7 days.
- A fix, or a clear explanation of why it is not a vulnerability, within 30 days for anything that lets a page or a file do something the user did not ask for.
- Credit in the release notes if you want it.

## Out of scope

- Anything that requires the attacker to already control the host process or the user's profile directory.
- Visual glitches with no data or control-flow consequence.
- The plugin's inability to annotate PDFs, or the missing eraser — those are documented limits, not vulnerabilities.
