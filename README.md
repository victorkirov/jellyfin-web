# Jellyfin Web for older LG TVs

**Is Jellyfin painfully slow on your older LG TV?** This fork of [jellyfin-web](https://github.com/jellyfin/jellyfin-web) makes it fast again.

## Why this exists

I have an LG OLED55C7, a 2017 TV that still has a great picture. It runs webOS 3.5, and the official [Jellyfin webOS app](https://github.com/jellyfin/jellyfin-webos) loads the Jellyfin web client in the TV's built-in browser, which is Chromium 38. Modern Jellyfin Web is built for much faster devices, and on this TV it was close to unusable:

- **Scrolling froze.** Holding Down through a large Movies or TV library froze the screen for seconds while posters loaded.
- **Blurred placeholders made it slower.** Each poster first drew a blurred preview, and that extra drawing work cost more time than it saved.
- **Animations stuttered.** The TV showed only the first and last frame of each transition, so they added load and nothing else.
- **Arrow keys were unpredictable.** Up from the first row jumped to the header, and Jump to letter scrolled away with the page, so it was out of reach in a long list.

If your TV is a few years old and Jellyfin feels sluggish on it, this fork is for you.

## What is different

- **Fast scrolling.** Posters load ahead of where you are looking, one per frame, so the remote never stops responding. Loaded posters stay loaded while you scroll back up.
- **No animations.** Nothing moves except the loading spinner. Focus is shown with clear, static highlights that are easy to see from the couch.
- **Arrow-key navigation that does what you expect.**
  - A fixed rail on the left of library grids such as Movies and TV Shows holds Jump to letter, Sort, Filter, View and paging, and it is one press away at any depth.
  - Up from the first row goes to the tabs, and Down brings you back to the same card.
  - Back returns you to the card you came from.
- **A clean details page.** Play or Resume, Restart, Trailer, Watched, Favorite and More sit in one row of large buttons.
- **A lighter app.** A smaller startup bundle, lazy loading, and fewer requests and redraws.

The admin dashboard, setup wizard, modern UI, metadata editing and other non-TV features are removed to keep the app small. Set up and manage your Jellyfin server from another client. Login, server selection, Quick Connect, playback and device settings all work on the TV.

It is built for LG webOS 3.x TVs (Chromium 38). Other webOS versions and devices may work, but they are not tested.

## Run with Docker

Set `JELLYFIN_UPSTREAM_HOST` in [docker/compose.yaml](docker/compose.yaml) to your existing Jellyfin server's `host:port` (plain HTTP), then run from the repository root:

```sh
docker compose -f docker/compose.yaml up -d --build
```

The container serves the client at `http://<host>:8097/web/` and proxies server requests to `JELLYFIN_UPSTREAM_HOST`, reusing connections. Point the TV app at `http://<host>:8097`, using a host address reachable from the TV. To use another port, change the left side of `"8097:80"` in [docker/compose.yaml](docker/compose.yaml).

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
