# Jellyfin Web for slower TVs

This fork of [jellyfin-web](https://github.com/jellyfin/jellyfin-web) targets slower devices, particularly LG webOS TVs running webOS 3.x with Chromium 38 through the official [Jellyfin webOS app](https://github.com/jellyfin/jellyfin-webos).

It runs the legacy client in TV layout, with remote-control navigation and the webOS app's NativeShell integration. Performance changes include a smaller startup bundle, lazy loading, and fewer redundant requests and renders.

The admin dashboard, setup wizard, modern UI, metadata editing, and other non-TV features have been removed. Set up and administer the Jellyfin server from another client. Login, server selection, Quick Connect, playback, and device-local settings remain available on the TV.

## Run with Docker

Set `JELLYFIN_UPSTREAM_HOST` in [docker/compose.yaml](docker/compose.yaml) to your existing Jellyfin server's `host:port` (plain HTTP), then run from the repository root:

```sh
docker compose -f docker/compose.yaml up -d --build
```

The container serves the client at `http://<host>:8097/web/` and proxies server requests to `JELLYFIN_UPSTREAM_HOST`, reusing connections. Point the TV app at `http://<host>:8097`, using a host address reachable from the TV.

## Local development

Use Node.js 24 or newer and npm 11 or newer.

```sh
npm ci
npm start
```

To produce a production build in `dist/` and run checks:

```sh
npm run build:production
npm test
npm run lint
npm run escheck
```

`npm run escheck` checks the emitted JavaScript, so run the production build first. `npm run build:check` runs TypeScript checking.

## Compatibility and credits

The build targets Chromium 38. Other browsers are not a target. Validate playback, subtitles, and remote navigation on the TV when changing compatibility-sensitive code.

This fork builds on Jellyfin Web and the work of its [contributors](CONTRIBUTORS.md). It retains the upstream [GPL-2.0-or-later license](LICENSE).
