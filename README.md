# Accessible Seerr

Accessible Seerr is a small, screen-reader-friendly alternative frontend
for an existing self-hosted Seerr instance (Overseerr, Jellyseerr, or a
compatible fork). It provides properly labeled search
results, media details, and request controls for users of VoiceOver, NVDA,
JAWS, Narrator, Orca, and other assistive technologies.

**Accessible Seerr is not a replacement for Seerr.** It is a second,
accessibility-focused client that talks to your existing Seerr instance's
API. Seerr remains fully responsible for authentication, permissions,
request limits, approval rules, Sonarr/Radarr configuration, quality
profiles, root folders, notifications, request history, availability
status, and duplicate-request prevention. Accessible Seerr never bypasses
any of that.

> `seerr.example.com` is a reserved documentation example throughout this
> file. Replace it with your own hostname; it must never appear in your
> deployment.

---

## Features

- Sign in with your **Jellyfin account** (username + password), via Seerr's
  own Jellyfin authentication endpoint
- Reuses an existing Seerr session automatically — no repeated logins
- Accessible search results with real, spoken media titles
- Movie details: overview, genres, runtime, availability
- Television details: overview, genres, season count, availability
- Movie requests
- Season-by-season television requests with labeled checkboxes
- Session-cookie authentication — no API keys or passwords stored anywhere
- Same-origin deployment (no CORS workarounds needed)
- A single, domain-independent Docker image — deploy it on any hostname
  without rebuilding
- A configurable deployment path (default `/accessible`)

## Architecture

```text
Browser
├── https://YOUR_DOMAIN/ACCESSIBLE_PATH/  → Accessible Seerr static frontend
│                                           (this project, served by Nginx)
└── https://YOUR_DOMAIN/api/v1/           → Your existing Seerr instance
```

Accessible Seerr is a static site: semantic HTML, plain CSS, plain
JavaScript, served by a minimal `nginx:alpine` container. There is no
frontend framework, no build step, no npm/yarn/pnpm, and no bundler. The
browser talks directly to Seerr's API using relative, same-origin requests
and Seerr's own session cookie — this project never sees your Seerr
password, API key, or session cookie value.

All Sonarr, Radarr, Prowlarr, Jellyfin, Plex, and TMDB configuration
remains entirely inside Seerr. Accessible Seerr never communicates with
those services directly.

## Security model

- **No API key in the browser.** Accessible Seerr never embeds Seerr's
  global API key, Sonarr key, Radarr key, or any other secret.
- **No password storage.** The password field is cleared immediately after
  a login attempt and is never written to any form of browser storage.
- **Session-cookie authentication.** All authenticated requests use
  `credentials: "include"` so the browser sends Seerr's own HttpOnly
  session cookie. JavaScript never reads or writes that cookie.
- **Same-origin requests only.** The frontend calls root-relative paths
  like `/api/v1/search`, never an absolute URL, so it only ever works when
  deployed on the same origin as Seerr.
- **HTTPS is required** for any real deployment, because this application
  transmits login credentials and an authenticated session. Plain HTTP is
  not a supported production configuration.
- **Small attack surface.** The static container serves only HTML, CSS,
  and JavaScript with a strict Content-Security-Policy — no server-side
  code, no database, no persistent state.
- **`PUBLIC_DOMAIN` never reaches the frontend.** It is deployment
  metadata used only to render local reverse-proxy configuration and
  documentation; it is not passed into the Docker image, not embedded in
  `index.html`, and not sent to the browser in any form.
- Files under `generated/` and your local `.env` may contain your real
  hostname and internal Docker service names. **Review them before sharing
  logs or configuration publicly** — they are ignored by Git so they stay
  local to your deployment.

## File structure

```text
accessible-seerr/
├── CLAUDE.md                          Project instructions / specification
├── README.md                          This file
├── LICENSE                            MIT license
├── Dockerfile                         Builds the static frontend image
├── docker-compose.yml                 Runs the frontend on a shared network
├── nginx.conf                         In-container Nginx config (no hostname, no TLS)
├── .dockerignore
├── .gitignore
├── .env.example                       Template for local deployment settings
├── scripts/
│   └── configure.sh                   Validates .env and renders proxy configs
├── templates/
│   ├── nginx-site.conf.template       Nginx reverse-proxy template
│   ├── caddyfile.template             Caddy reverse-proxy template
│   └── nginx-proxy-manager.md.template  Step-by-step NPM setup guide template
├── generated/                         Rendered, hostname-specific configs (git-ignored)
│   └── .gitkeep
└── public/                            The static site actually served
    ├── index.html
    ├── app.js
    └── styles.css
```

## Prerequisites

- An existing, already-configured Jellyseerr instance (or a compatible fork
  that exposes `/api/v1/auth/jellyfin`), connected to your Jellyfin server
- An existing HTTPS reverse proxy (Nginx, Caddy, Traefik, Nginx Proxy
  Manager, Apache, or similar) already serving Seerr
- Docker and Docker Compose
- A Docker network shared between your reverse proxy, Seerr, and this
  project's container
- A domain name pointing at your reverse proxy

## Installation

```bash
git clone REPOSITORY_URL
cd accessible-seerr
cp .env.example .env
```

Edit `.env` with your public hostname, frontend path, Docker network, and
Seerr container name/port (see [Environment variables](#environment-variables)).

```bash
chmod +x scripts/configure.sh
./scripts/configure.sh
docker compose build
docker compose up -d
```

`scripts/configure.sh` validates `.env` and writes reverse-proxy
configuration into `generated/`. Apply the relevant generated file (or
follow `generated/nginx-proxy-manager.md`) in your existing reverse proxy,
then reload it.

You can also configure interactively:

```bash
./scripts/configure.sh --interactive
docker compose up -d --build
```

`--interactive` prompts for each value (with sensible defaults), writes
`.env` for you (warning before overwriting an existing one), and then
generates the same proxy configuration files.

## Environment variables

Defined in `.env` (copied from `.env.example`):

| Variable | Purpose | Example |
| --- | --- | --- |
| `PUBLIC_DOMAIN` | Public HTTPS hostname serving both Seerr and Accessible Seerr | `seerr.example.com` |
| `ACCESSIBLE_PATH` | URL path Accessible Seerr is served under | `/accessible` |
| `DOCKER_NETWORK` | Existing Docker network shared with your Seerr container | `media` |
| `SEERR_CONTAINER` | Seerr's container or service name on that network | `seerr` |
| `SEERR_PORT` | Seerr's internal port | `5055` |

**`PUBLIC_DOMAIN` is never passed to the frontend.** It is used only by
`scripts/configure.sh` to render the files in `generated/` and to print
installation URLs. The Docker image and the JavaScript/HTML it serves
never receive this value, so the same image works unmodified on any
domain.

## Reverse-proxy instructions

`scripts/configure.sh` renders three files from `templates/` into
`generated/`:

- `generated/nginx-site.conf` — a full Nginx `server` block
- `generated/Caddyfile` — a Caddy site block (Caddy can usually obtain
  HTTPS certificates automatically)
- `generated/nginx-proxy-manager.md` — step-by-step instructions for
  Nginx Proxy Manager's UI

All three implement the same routing model:

```text
${ACCESSIBLE_PATH}/  → accessible-seerr container (this project), port 80
/api/                → Seerr container, port ${SEERR_PORT}
/                     → Seerr container, port ${SEERR_PORT}
```

Key points:

- The frontend and Seerr **must** share an origin (same protocol, host,
  and port) so the browser can reuse Seerr's session cookie without CORS.
- `proxy_pass http://accessible-seerr:80/;` keeps its **trailing slash**
  intentionally — this strips the `${ACCESSIBLE_PATH}` prefix before
  forwarding to the static container, so the container always sees paths
  relative to `/`.
- A request to `${ACCESSIBLE_PATH}` without a trailing slash is redirected
  to `${ACCESSIBLE_PATH}/`. Link to the trailing-slash form to avoid an
  extra redirect.
- `/api/` must keep routing to Seerr, not to the accessible frontend.
- Everything else (`/`) continues to route to Seerr's own interface,
  unchanged.

## Domain independence

> During setup, users configure their HTTPS hostname and deployment path
> in a local `.env` file or through the interactive configuration script.
> These values are used to generate reverse-proxy configuration and are
> never embedded in the frontend application. The browser client uses
> same-origin relative API URLs, so changing domains does not require
> rebuilding the application.

> Accessible Seerr is domain-independent. It uses same-origin relative
> URLs and can be installed on any HTTPS hostname. No hostname is compiled
> into or stored by the frontend application.

## Authentication explanation

- `POST /api/v1/auth/jellyfin` — signs in with
  `{ "username": "...", "password": "..." }`. Seerr forwards these
  credentials to the Jellyfin server it is configured against and, on
  success, starts a normal Seerr session — this project never contacts
  Jellyfin directly
- `GET /api/v1/auth/me` — checks whether a valid session already exists
- Every authenticated request is sent with `credentials: "include"`, so
  the browser attaches Seerr's own session cookie automatically
- There is no global Seerr API key anywhere in this project — the app acts
  strictly as the signed-in user, with that user's own Seerr permissions
- Nothing related to authentication (password, cookie value, tokens) is
  ever written to `localStorage`, `sessionStorage`, `IndexedDB`, or logged
  to the console

## API endpoint summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/auth/me` | Check for an existing session |
| `POST` | `/api/v1/auth/jellyfin` | Sign in with a Jellyfin account |
| `POST` (falls back to `GET`) | `/api/v1/auth/logout` | Sign out |
| `GET` | `/api/v1/search` | Search movies and television series |
| `GET` | `/api/v1/movie/{id}` | Movie details |
| `GET` | `/api/v1/tv/{id}` | Television details |
| `POST` | `/api/v1/request` | Submit a movie or television request |

Endpoint behavior can vary slightly between Seerr forks and releases.
Where that's expected, this project isolates the difference behind a
single adapter function rather than spreading version checks throughout
the codebase (see below).

## Updating API mappings

All endpoint paths live in the `API_PATHS` constant near the top of
`public/app.js`. Version-specific behavior is isolated in a small number
of named functions in the same file:

- `logoutFromSeerr()` — tries `POST /api/v1/auth/logout` first, falls back
  to `GET` on 404/405, and clears local UI state either way
- `checkCurrentSession()` — treats any failure from `GET /api/v1/auth/me`
  as "not signed in" rather than surfacing a raw error
- `getMediaTitle()`, `getMediaYear()`, `getMediaDescription()` — read
  multiple possible field names (`title`/`name`/`originalTitle`/
  `originalName`, `releaseDate`/`firstAirDate`, `overview`) so differences
  in movie vs. television field naming, and minor API-shape differences,
  don't break rendering
- `getAvailabilityLabel()` / `getRequestStatusLabel()` — translate numeric
  Seerr status codes into plain-language text, falling back to "Status
  unknown" / "Unknown status" for unrecognized codes instead of exposing a
  raw number

If your Seerr fork uses different endpoint paths or response shapes,
update `API_PATHS` and the relevant adapter function above — the rest of
the application does not need to change.

## Accessibility testing

Recommended manual passes before deploying changes:

- **VoiceOver (iOS Safari):** rotor navigation by heading, form control,
  and button; confirm result titles and season checkboxes are announced
  correctly
- **VoiceOver (macOS Safari):** same checks, plus keyboard-only navigation
- **NVDA (Windows, Firefox and Chrome):** heading navigation (`H`), form
  mode, landmark navigation (`D`), live-region announcements
- **Keyboard-only:** complete every flow (sign in, search, open details,
  request, sign out) using only Tab, Shift+Tab, Enter, and Space
- **Browser zoom:** test at 200% zoom for layout and reflow
- **Reduced motion:** enable your OS's reduce-motion setting and confirm
  no essential information depends on animation
- **Dark mode / light mode:** toggle OS appearance and confirm contrast
  holds up in both
- **Live-region announcements:** confirm status messages (searching,
  results found, request submitted, session expired) are read once, not
  duplicated or dropped

## Troubleshooting

**404 on frontend assets (`styles.css`, `app.js`)**
Check that your reverse proxy's `${ACCESSIBLE_PATH}/` location proxies to
`accessible-seerr:80/` with the trailing slash preserved, so the prefix is
stripped before reaching the static container.

**Login succeeds in Seerr but not in Accessible Seerr**
Confirm both are served from the exact same origin (protocol, host, and
port). A separate frontend hostname will not receive Seerr's session
cookie.

**Session cookie not sent / repeated 401 responses**
Verify HTTPS is used end-to-end, that the browser isn't blocking
third-party cookies for a mismatched origin, and that `credentials:
"include"` requests aren't being stripped by an intermediate proxy.

**403 responses**
This usually means the signed-in account is authenticated but lacks
permission for that action in Seerr. Accessible Seerr surfaces this as a
"denied for your account" message and does not log the user out for 403s.

**API requests routed to the frontend container**
Check location-block ordering in your reverse proxy — `/api/` and
`${ACCESSIBLE_PATH}/` must be matched before any catch-all `/` block.

**Frontend path not stripped correctly**
Re-check the trailing slash on `proxy_pass http://accessible-seerr:80/;`.
Removing it changes Nginx's prefix-stripping behavior.

**Docker network resolution failure**
Confirm `DOCKER_NETWORK` in `.env` matches an existing external network
that both Seerr and `accessible-seerr` are attached to.

**CSP errors in the browser console**
This project ships no inline scripts or styles and needs no
`unsafe-inline`/`unsafe-eval`. A CSP violation usually means a browser
extension or an intermediate proxy is injecting content — Accessible
Seerr's own code doesn't require CSP changes.

**Blank search results**
Confirm the query isn't whitespace-only, check the Network tab for the
`/api/v1/search` response shape, and remember that person results are
intentionally filtered out.

**Seerr response-shape differences**
See [Updating API mappings](#updating-api-mappings) above.

**Logout endpoint mismatch**
If your Seerr fork responds differently to `/api/v1/auth/logout`, local
UI state is still cleared, but the user will be told that server-side
sign-out could not be confirmed. Adjust `logoutFromSeerr()` if needed.

**Incorrect trailing slash**
Both the reverse-proxy `proxy_pass` target and links to
`${ACCESSIBLE_PATH}/` matter — see the reverse-proxy section above.

**HTTPS and mixed-content errors**
Ensure your reverse proxy redirects HTTP to HTTPS and that no absolute
`http://` URLs are referenced anywhere (this project uses only relative
and root-relative URLs, so this typically indicates a proxy
misconfiguration).

**502 Bad Gateway from a host-installed reverse proxy**
The bundled templates (`templates/nginx-site.conf.template`,
`templates/caddyfile.template`) proxy to `accessible-seerr:80` and
`${SEERR_CONTAINER}:${SEERR_PORT}`. Those are **Docker-internal DNS
names** — they only resolve for other containers attached to the same
`DOCKER_NETWORK`. If your reverse proxy (Nginx, Caddy, Apache, ...) runs
directly on the host instead of inside a container on that network, it
cannot resolve those names and every request to `${ACCESSIBLE_PATH}/`
will 502, even though `docker ps` shows `accessible-seerr` as healthy.

To fix this, either:

* Run your reverse proxy in Docker, attached to the same external
  `DOCKER_NETWORK` as `accessible-seerr` and Seerr, and use the
  generated templates unmodified; or
* Keep your reverse proxy on the host and publish a loopback-only port
  for `accessible-seerr` instead. In `docker-compose.yml`:

  ```yaml
      ports:
        - "127.0.0.1:8084:80"
  ```

  Then point your host reverse proxy at `127.0.0.1:8084` instead of
  `accessible-seerr:80` (and, if Seerr itself is also only reachable by
  Docker service name, do the same for `${SEERR_CONTAINER}:${SEERR_PORT}`).
  Do not bind this port to `0.0.0.0` — that would expose the frontend
  container outside the host without a TLS-terminating proxy in front
  of it.

## Browser developer tools

When diagnosing an issue:

- **Network tab:** inspect request URLs, status codes, and response JSON
  for `/api/v1/...` calls
- **Console:** check for CSP violation messages, which name the exact
  blocked resource
- **Application/Storage tab:** confirm no Seerr credentials or cookie
  values appear in `localStorage`/`sessionStorage`/`IndexedDB` (they
  should not be there)

Before sharing screenshots, HAR files, or console output publicly,
**redact**:

- Cookie values
- Account usernames, email addresses, or display names
- Your real domain name
- Internal Docker service/container names
- Any request or response body containing account-specific data

## Known limitations

- Search returns only the first page from Seerr; additional-page fetching
  beyond Next/Previous navigation on the current page is not implemented
  beyond what Seerr's own pagination metadata provides
- Person search results are intentionally not displayed
- Jellyfin sign-in only — this version does not implement local Seerr
  accounts, Plex OAuth, or other external sign-in methods
- Optional per-request settings (server selection, quality profile, root
  folder, language profile, tags, 4K) are not exposed; Seerr's configured
  defaults are used
- No poster artwork is shown by design — this keeps the interface fast,
  reduces layout complexity for screen-reader and low-vision users, and
  avoids depending on TMDB image delivery
- Numeric Seerr status codes not present in `MEDIA_STATUS_LABELS` /
  `REQUEST_STATUS_LABELS` fall back to a generic "Status unknown" label

## Upgrade instructions

```bash
git pull
docker compose build --pull
docker compose up -d
```

Review the project's release notes for changes to `templates/` or
`scripts/configure.sh`, and re-run `./scripts/configure.sh` (or
`--interactive`) if template variables changed, so `generated/` stays in
sync with your reverse proxy configuration.

## Uninstallation

```bash
docker compose down
```

This stops and removes only the Accessible Seerr frontend container and
its Compose-managed resources. It does not touch Seerr, its database, or
any media managed by Sonarr/Radarr/Jellyfin/Plex.

---

## Testing checklist

### Setup and deployment
- [ ] `.env.example` contains placeholders only
- [ ] `.env` is ignored by Git
- [ ] Generated proxy files are ignored by Git
- [ ] Docker image builds
- [ ] Static container starts and passes its healthcheck
- [ ] Container is reachable through the shared Docker network
- [ ] Configured domain appears only in local `.env`/`generated/` files
- [ ] Configured frontend path routes correctly
- [ ] Frontend assets load under the configured path
- [ ] Seerr remains available at the root
- [ ] `/api/v1/` routes to Seerr
- [ ] HTTPS works end-to-end

### Authentication
- [ ] Valid Jellyfin login
- [ ] Invalid login shows a generic failure message
- [ ] Empty username is rejected client-side with a field-level message
- [ ] Empty password is rejected client-side with a field-level message
- [ ] Existing authenticated session is detected on load
- [ ] Session expiration mid-use returns the user to sign-in with an announcement
- [ ] Permission-denied (403) does not force a logout
- [ ] Logout succeeds and clears the UI
- [ ] Logout endpoint failure still clears local UI state and informs the user
- [ ] Password field is cleared after every login attempt
- [ ] No credentials are ever written to browser storage

### Search
- [ ] Movie search returns results
- [ ] Television search returns results
- [ ] Empty search is rejected before calling the API
- [ ] Whitespace-only search is rejected before calling the API
- [ ] No-results search shows a clear message
- [ ] A malformed individual result does not crash the page
- [ ] Person results are ignored and excluded from the announced count
- [ ] Network failure during search shows a network-specific message
- [ ] Server error during search shows a generic server message
- [ ] Duplicate simultaneous search submissions are prevented
- [ ] Search button shows a loading state ("Searching…")
- [ ] Result count is announced via the polite live region

### Results accessibility
- [ ] Every result has a real, spoken title
- [ ] Every details button has a full, meaningful accessible name
- [ ] Media type is included in the accessible name
- [ ] Year is included when available, omitted cleanly when not
- [ ] No control is announced only as "button"
- [ ] No control is announced only as "movie" or "series"
- [ ] Heading navigation (H key in NVDA, rotor in VoiceOver) works
- [ ] Reading order is linear and matches visual order
- [ ] Result status text is understandable without color
- [ ] Missing fields never render as "undefined", "null", or "NaN"

### Details
- [ ] Open movie details
- [ ] Open television details
- [ ] Loading state is announced
- [ ] Details-fetch failure shows a clear, retryable error
- [ ] Back-to-results button works
- [ ] Focus returns to the originating result button
- [ ] Search query and results remain intact after returning
- [ ] Genres render as readable text
- [ ] Runtime renders for movies
- [ ] Season count renders for television
- [ ] Availability is stated in plain language

### Requests
- [ ] Request a movie
- [ ] Duplicate movie request is handled gracefully (409)
- [ ] Pending-approval status is shown after a successful request
- [ ] Auto-approved status is shown after a successful request
- [ ] Select a single television season
- [ ] Select multiple television seasons
- [ ] "Select all available seasons" works
- [ ] "Clear selected seasons" works
- [ ] Submitting with zero seasons selected shows a validation message and moves focus
- [ ] Already-requested seasons are shown as disabled with a labeled reason
- [ ] Unavailable/disabled seasons cannot be selected
- [ ] Duplicate submission is prevented while a request is in flight
- [ ] Successful request is announced
- [ ] Failed request is announced with a clear message
- [ ] Status updates in the UI after a successful request

### Keyboard
- [ ] Every flow is completable without a mouse
- [ ] Tab order is logical
- [ ] Shift+Tab order is logical
- [ ] Enter activates buttons and submits forms
- [ ] Space activates buttons and checkboxes
- [ ] Focus is visible on every interactive element
- [ ] No keyboard trap exists anywhere
- [ ] The skip link works and moves focus to `#main-content`
- [ ] Hidden sections are not reachable by Tab

### Screen readers
- [ ] VoiceOver, iOS Safari
- [ ] VoiceOver, macOS Safari
- [ ] NVDA, Firefox
- [ ] NVDA, Chrome
- [ ] Heading navigation
- [ ] Landmark navigation
- [ ] Form-control navigation
- [ ] Button navigation
- [ ] Live-region announcements are heard once, not duplicated
- [ ] Error announcements interrupt appropriately
- [ ] Result titles are spoken correctly
- [ ] Season checkbox labels are spoken correctly
- [ ] Focus restoration after closing details works

### Visual and responsive behavior
- [ ] iPhone portrait
- [ ] iPhone landscape
- [ ] Narrow desktop browser width
- [ ] 200% browser zoom
- [ ] Dark mode
- [ ] Light mode
- [ ] Reduced motion
- [ ] High contrast mode, where supported by the OS/browser
- [ ] Long titles wrap without breaking layout
- [ ] Long descriptions wrap without breaking layout
- [ ] Large system text settings don't clip content

### Security
- [ ] No API key anywhere in the repository
- [ ] No hard-coded hostname anywhere in the repository
- [ ] No real email address anywhere in the repository
- [ ] No personal domain anywhere in the repository
- [ ] No real IP address anywhere in the repository
- [ ] No credential logging
- [ ] No cookie-value logging
- [ ] No `eval` or `new Function`
- [ ] No `innerHTML` used with API-provided data
- [ ] No inline `<script>` blocks
- [ ] No inline event handler attributes
- [ ] The CSP produces no violations during normal use
- [ ] All frontend API requests are same-origin
- [ ] Authenticated requests include `credentials: "include"`
- [ ] The password field is never persisted anywhere
- [ ] `.env` and `generated/` remain ignored by Git

---

Your `.env` and generated reverse-proxy files may contain your public
hostname and internal Docker service details. Review them before sharing
logs or configuration publicly.
