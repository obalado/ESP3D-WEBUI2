# Build and upload ESP3D WebUI

## Requirements

Install Node.js, npm, and curl. Connect the development machine to the FluidNC device network.

## Install dependencies

Run this command from the repository root:

```bash
npm install
```

## Build the WebUI

Build the English package:

```bash
npx gulp package --lang en
```

The build creates these files:

- `index.html.gz` for the FluidNC device
- `dist/index.html` for local testing

A package with all languages may exceed the ESP32 flash limit. Replace `en` with another language code when needed.

## Validate the package

Check the gzip file before upload:

```bash
gzip -t index.html.gz
```

A successful check produces no output and returns exit status `0`.

## Upload the package

Upload the package to the FluidNC device at `192.168.0.1`:

```bash
curl --fail-with-body --show-error \
  -F "file=@index.html.gz;filename=/index.html.gz" \
  http://192.168.0.1/files
```

Replace `192.168.0.1` when the device uses another address.

Confirm that the response contains `"status":"Ok"` and reports the expected `index.html.gz` size.

## Load the new WebUI

Open the device address in a browser:

```text
http://192.168.0.1/
```

Use a hard refresh if the browser shows a cached version.
