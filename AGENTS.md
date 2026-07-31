# Repository instructions

## Project scope

This repository builds a monolithic WebUI for FluidNC controllers. FluidNC serves the compressed UI from its local filesystem.

## Repository map

- `www/index.html` defines the page shell and includes HTML fragments.
- `www/sub/` contains tabs, panels, and modal dialog markup.
- `www/js/` contains the legacy WebUI logic and FluidNC integration.
- `www/css/` contains the legacy WebUI styles.
- `gulpfile.js` concatenates, filters, minifies, inlines, and compresses all assets.
- `dist/index.html` is an ignored, uncompressed build for local testing.
- `index.html.gz` is the tracked firmware asset deployed to FluidNC.
- `fluidnc-web-sim.py` serves the local build and proxies requests to a FluidNC controller.
- `test_files/` supplies sample files for the simulator's incomplete standalone mode.

## Setup

1. Install the locked Node dependencies with `npm ci`.
2. Do not use the outdated `npm init` command from older documentation.

The build dependencies are old and report known audit findings. Do not run `npm audit fix` unless the task requests dependency work.

## Build commands

Build the normal English firmware package:

```bash
npm exec -- gulp package --lang en
```

This command creates `dist/index.html` and replaces `index.html.gz`. It also validates that Uglify can parse the bundled JavaScript.

Build all languages only when requested:

```bash
npm exec -- gulp package --lang all
```

The multilingual file can exceed the FluidNC flash size limit. Prefer `--lang en` for normal FluidNC changes.

Do not use `npm test`. The configured test script always exits with an error because this repository has no automated suite.

The Gulp `lint` task checks only `www/js/app.js`. A successful lint does not validate other JavaScript files.

## Architecture and protocol

The application uses browser globals, inline event handlers, and direct DOM updates. It has no application framework or module loader.

Gulp bundles every `www/js/**/*.js` file into one script. Avoid duplicate global names.

Gulp bundles every `www/css/**/*.css` file into one stylesheet.

The build expands nested `<file-include>` elements twice. Keep reusable markup in `www/sub/` and avoid deeper include nesting.

Startup requests `[ESP800]` through `/command?plain=...`. `www/js/connectdlg.js` parses its ordered, `#`-delimited firmware fields.

Printer commands use `/command?commandText=...`. Responses and status reports arrive through the FluidNC WebSocket and reach `grblHandleMessage`.

`www/js/http.js` serializes HTTP requests and appends `PAGEID` where required. Preserve queue ordering and callback behavior.

The `/upload` endpoint manages SD files. The `/files` endpoint manages FluidNC local filesystem files.

Command encoding is protocol-sensitive. Preserve explicit encoding for `#`, `+`, newlines, and query separators.

## Editing rules

- Make the smallest change that satisfies the request.
- Match nearby JavaScript style instead of modernizing unrelated code.
- Keep shared global contracts stable across `www/js/` and `www/sub/`.
- Change source files instead of editing `dist/index.html` or decompressed package output.
- Preserve `removeIf` and `endRemoveIf` markers because Gulp uses them for production and language filtering.
- Use `translate` on translatable HTML and keep `english_content` keys stable.
- Add English translation keys in `www/js/language/en.js` when code needs explicit lookup entries.
- Keep FluidNC-specific labels or messages consistent with `www/js/language/fl.js`.
- Do not reformat large legacy files during a focused change.
- Do not change firmware protocol assumptions without checking matching FluidNC behavior.

## Verification

For every source change:

1. Run `npm exec -- gulp package --lang en`.
2. Confirm `gzip -t index.html.gz` succeeds.
3. Inspect `git status` for unintended generated changes.
4. Test affected behavior in a browser when the change involves UI or protocol logic.

Start the local proxy after building:

```bash
uv run --with flask --with requests --with websockets --with zeroconf fluidnc-web-sim.py <FLUIDNC_IP>
```

Open `http://localhost:8080`. The proxy serves `dist/index.html` and forwards controller traffic to the specified FluidNC address.

The simulator's standalone mode is incomplete. It does not support uploads, OTA, settings changes, G-code execution, or machine motion.

Test protocol changes against a compatible FluidNC device when possible. Check startup, WebSocket status, commands, and affected file operations.

Manual controller tests can move machinery or start outputs. Secure the machine and use safe commands before connecting the UI.

## Generated artifacts

Do not commit `dist/` or `node_modules/`. Both paths are ignored build output.

Regenerate `index.html.gz` after changes that affect the packaged UI. Include it only when the task or repository convention requires it.

Do not regenerate `index.html.gz` for documentation-only changes. Gzip or minifier versions can produce unrelated binary differences.

## Completion checklist

- The requested behavior works in each relevant WebUI view.
- The English package builds without errors.
- The compressed package passes `gzip -t`.
- The diff contains only requested source changes and intentional generated artifacts.
