# AVRT Config

A browser-based configurator for SainSonic AP510 and AVRT5 APRS trackers. It uses
[Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) to communicate with the tracker. It has been tested on a limited number of devices (around 20), but all of them with recent firmware. Please read the instructions carefully and proceed at your own risk when using this software. That said: I have been testing a lot and still haven't be able to brick any of the devices I have used.

Writing is enabled for the hardware-tested firmware versions `AVRT5 20210404` and `AVRT5 20200605`. Other versions may be read, but writing is blocked. If your version is blocked, please include its firmware version, the downloaded trace from Diagnostics, and relevant Activity details in a [new issue report](https://github.com/perja12/avrt-config/issues/new).

This software has been built as a [Progressive Web App (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) and can be installed so that it is easily accesible from the desktop. It should also work without any network connectivity.

>[!NOTE]
>The cable for programming these devices is not a regular USB cable! It looks like a regular USB cable, but the programming cable has a serial chip built-in. Either use the one that came with the tracker or build your own. I will over time add instructions for this. See for example this [link](https://www.richardmudhar.com/blog/2018/10/sainsonic-ap510-aprs-tracker-experiments/).

I hope that the software can be useful and make it easer to program these trackers. Let me know if you see any problems by [creating an issue report](https://github.com/perja12/avrt-config/issues).

The page is available at <https://tracker.lb2kk.no>.

## AI Disclosure

This project was built with the assistance of AI.

- **Tools Used:** codex
- **Scope:** codex generated substantial parts of the implementation, including the automated test suites and initial boilerplate.
- **Human Verification:** All (or most) logic and final integrations were manually reviewed, debugged, and verified by the maintainer by manual testing.

## Development

Use Node.js version 22.

```sh
nvm install
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

If pnpm is already installed, `pnpm` can replace `corepack pnpm` in these commands.
If your system Node.js is compatible, `nvm use system` also works.
Open the local URL printed by Vite.

How to run tests and build:
```sh
pnpm test
pnpm build
```

The final output after processing with Vite is in `dist/`.

For development without hardware, append `?mockTracker=normal` (or `?mockTracker=1`) to the app URL for a supported tracker. Use `?mockTracker=unsupported` to read a mock tracker with unverified firmware and check that Write and Apply template are blocked. Mock mode does not communicate with a physical device.

Templates and programmed-device history are stored in browser local storage.
Diagnostics has a Download trace button for serial bytes, configuration captures, and operation results. Traces stay in memory until the page is reloaded or closed, unless downloaded.

## Source layout

- `app.js`, `index.html`: application entry points.
- `src/tracker-config/`: configuration parsing, validation, and editing.
- `src/tracker-serial/`: serial transport and protocol handling.
- `src/tracker-workflow/`: read/write workflow and simulated tracker.
- `src/tracker-template/`: templates and device history.
- `src/ui/`, `src/content/`, `src/styles.css`: interface and help content.
- `public/`: service worker, manifest, icons, and installation screenshots.
- `scripts/`: manifest and icon generation; icon generation requires ImageMagick.

## License

MIT; see [LICENSE](LICENSE).


73 LB2KK
