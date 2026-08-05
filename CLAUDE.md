# Accessible Seerr — Project Instructions

Create a complete, production-ready project named **Accessible Seerr**.

Accessible Seerr is a simple, screen-reader-friendly web client for an existing self-hosted Seerr instance. Its primary goal is to provide properly labeled search results, media details, and request controls for users of VoiceOver, NVDA, JAWS, Narrator, Orca, and other assistive technologies.

Generate every required project file with complete working contents.

Do not leave placeholders such as:

```text
TODO
Implement later
Add API call here
```

Where Seerr API behavior differs between versions, implement clean adapter functions, graceful fallback behavior, and clear documentation.

---

# Core purpose

The application must allow a user to:

1. Open the accessible interface.
2. Sign in using their existing Seerr local account.
3. Search for movies and television series.
4. Hear the actual media title in every search result.
5. Open accessible media details.
6. Request movies.
7. Select and request television seasons.
8. Review current availability or request status.
9. Sign out.

The application must communicate only with the existing Seerr API.

It must not communicate directly with:

* Sonarr
* Radarr
* Prowlarr
* Jellyfin
* Plex
* TMDB

Seerr must remain responsible for:

* Authentication
* User permissions
* Request limits
* Approval rules
* Sonarr configuration
* Radarr configuration
* Quality profiles
* Root folders
* Language profiles
* Notifications
* Request history
* Availability status
* Duplicate-request prevention

Do not bypass Seerr permissions.

---

# Architecture

Build Accessible Seerr as a static website using:

* Semantic HTML
* Plain CSS
* Plain JavaScript
* A small Nginx Docker container

Do not use:

* React
* Vue
* Angular
* Svelte
* TypeScript
* Node.js runtime
* npm
* yarn
* pnpm
* A frontend build process
* Third-party JavaScript libraries
* External CDNs
* Analytics
* External fonts
* Embedded API keys
* Service workers

The browser should communicate directly with Seerr using same-origin API requests and Seerr's normal authenticated session cookie.

The static container must not contain privileged credentials.

---

# Required file structure

Create this structure:

```text
accessible-seerr/
├── CLAUDE.md
├── README.md
├── LICENSE
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .dockerignore
├── .gitignore
├── .env.example
├── scripts/
│   └── configure.sh
├── templates/
│   ├── nginx-site.conf.template
│   ├── caddyfile.template
│   └── nginx-proxy-manager.md.template
├── generated/
│   └── .gitkeep
└── public/
    ├── index.html
    ├── app.js
    └── styles.css
```

A small test directory may be added if useful, but do not introduce a package manager solely for testing.

---

# Domain-independent deployment

The project must support any valid HTTPS hostname.

Users configure their public hostname during deployment, but the hostname must never be compiled into the frontend or Docker image.

The same Docker image must work on different domains without rebuilding.

Use generic documentation examples only, such as:

```text
https://seerr.example.com/
https://seerr.example.com/accessible/
https://seerr.example.com/api/v1/
```

Make clear that `seerr.example.com` is a reserved example and must be replaced.

Do not place a real personal domain, email address, IP address, username, or infrastructure identifier anywhere in the repository.

---

# Setup-time configuration

Provide `.env.example` with:

```dotenv
PUBLIC_DOMAIN=seerr.example.com
ACCESSIBLE_PATH=/accessible
DOCKER_NETWORK=media
SEERR_CONTAINER=seerr
SEERR_PORT=5055
```

Users should set up the project with:

```bash
cp .env.example .env
```

The `.env` file must be ignored by Git.

`PUBLIC_DOMAIN` is deployment configuration only.

It may be used for:

* Generating reverse-proxy configuration
* Displaying installation URLs
* Deployment validation
* Setup documentation

It must not be:

* Passed into frontend JavaScript
* Embedded into `index.html`
* Passed into the static container
* Used to construct API URLs
* Stored in browser storage

---

# Configurable frontend path

The default frontend path is:

```text
/accessible
```

Users must be able to configure another path, such as:

```text
/seerr-accessible
/request-client
/media-requests
```

The frontend must work under any configured single path prefix without source-code changes.

Use relative frontend asset paths:

```html
<link rel="stylesheet" href="./styles.css">
<script src="./app.js" defer></script>
```

Do not use:

```html
<link rel="stylesheet" href="/styles.css">
<script src="/app.js"></script>
```

Do not hard-code `/accessible/` in the frontend.

Seerr API calls must remain root-relative:

```javascript
fetch("/api/v1/auth/me", options);
fetch("/api/v1/search?query=example", options);
```

Do not prefix API calls with the accessible frontend path.

---

# Same-origin requirement

The recommended deployment must place the frontend and Seerr API on the same origin.

A valid layout is:

```text
Seerr interface:
https://YOUR_DOMAIN/

Accessible interface:
https://YOUR_DOMAIN/ACCESSIBLE_PATH/

Seerr API:
https://YOUR_DOMAIN/api/v1/
```

The protocol, hostname, and port must match.

This allows the browser to use Seerr's existing session cookie without CORS workarounds.

Do not recommend a separate frontend hostname as the default deployment.

Do not add CORS headers unless explicitly documenting an unsupported or advanced deployment.

---

# HTTPS requirement

Production deployments must use HTTPS.

The frontend handles login credentials and authenticated requests, so plain HTTP must not be presented as safe for public use.

The application container must not manage TLS certificates.

TLS should be handled by the user's existing reverse proxy, such as:

* Nginx
* Caddy
* Traefik
* Nginx Proxy Manager
* Apache

Do not include real certificate paths.

Use placeholders where needed:

```nginx
ssl_certificate /path/to/fullchain.pem;
ssl_certificate_key /path/to/private-key.pem;
```

---

# Docker configuration

Create a minimal `docker-compose.yml` for the accessible frontend only.

Use this model:

```yaml
services:
  accessible-seerr:
    build: .
    container_name: accessible-seerr
    restart: unless-stopped
    expose:
      - "80"
    networks:
      - shared

networks:
  shared:
    name: "${DOCKER_NETWORK}"
    external: true
```

Do not publish port 80 publicly by default.

Do not add:

```yaml
ports:
  - "8080:80"
```

unless documented as an optional local testing method.

Do not pass `PUBLIC_DOMAIN` into the container.

Do not add it under `environment`.

The static frontend does not need to know its domain.

---

# Dockerfile

Base the image on:

```text
nginx:alpine
```

Copy the public files to:

```text
/usr/share/nginx/html
```

Copy the container Nginx configuration to the appropriate Nginx configuration location.

Use a non-bloated image.

Do not install Node.js, Python, or build tools.

The image must contain only what is required to serve static files.

---

# Static container Nginx configuration

Create `nginx.conf` for the static frontend container.

It should:

* Serve `/usr/share/nginx/html`
* Use `index.html`
* Return correct content types
* Avoid directory listings
* Add security headers
* Provide sensible static-file caching
* Avoid caching `index.html` too aggressively
* Not proxy Seerr API requests
* Not contain the public hostname
* Not contain TLS configuration

Include these security headers or stronger equivalents:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

Do not require:

```text
unsafe-inline
unsafe-eval
```

The frontend must work under this Content Security Policy.

---

# Setup script

Create:

```text
scripts/configure.sh
```

It must be POSIX-friendly where practical and begin with an appropriate shell declaration.

It should support:

```bash
./scripts/configure.sh
```

and:

```bash
./scripts/configure.sh --interactive
```

The script must never request:

* Seerr passwords
* Seerr API keys
* Session cookies
* TLS private keys
* Sonarr credentials
* Radarr credentials
* Jellyfin credentials
* Prowlarr credentials

## Noninteractive mode

In normal mode, the script should:

1. Verify that `.env` exists.
2. Read required values safely.
3. Validate all configuration.
4. Create the `generated/` directory if needed.
5. Render reverse-proxy configuration templates.
6. Print the resulting public URLs.
7. Exit nonzero on invalid configuration.

## Interactive mode

Ask for:

* Public HTTPS hostname
* Accessible frontend path
* Existing Docker network name
* Seerr container or service name
* Seerr internal port

Provide these defaults:

```text
Accessible path: /accessible
Docker network: media
Seerr container: seerr
Seerr port: 5055
```

After collecting valid values:

* Write or update `.env`
* Generate local proxy configuration
* Print the installation URLs

Do not overwrite an existing `.env` without warning.

## Domain validation

Accept:

```text
seerr.example.com
requests.example.net
media.example.org
```

Reject:

```text
https://seerr.example.com
http://seerr.example.com
seerr.example.com/accessible
seerr.example.com:443
seerr example.com
```

The domain value must:

* Contain no protocol
* Contain no slash
* Contain no port
* Contain no whitespace
* Contain no shell metacharacters
* Use valid hostname characters
* Not be empty

Internationalized domains may be documented as requiring their ASCII/Punycode representation unless robust support is implemented.

## Path validation

`ACCESSIBLE_PATH` must:

* Begin with `/`
* Not equal `/`
* Contain no query string
* Contain no fragment
* Contain no whitespace
* Avoid `..`
* Avoid duplicate slashes
* Have its trailing slash removed before template rendering

Accept:

```text
/accessible
/seerr-accessible
/media/requests
```

Supporting a nested path such as `/media/requests` is desirable if the templates and asset routing remain correct.

## Port validation

`SEERR_PORT` must:

* Be numeric
* Be between 1 and 65535

## Safe environment handling

Do not use unsafe patterns that execute arbitrary `.env` contents.

Avoid blindly running:

```bash
source .env
```

unless the file is strictly parsed and validated first.

Implement a narrow parser for expected keys or otherwise prevent command execution.

Do not print secrets or raw environment files.

---

# Generated files

Render environment-specific output into:

```text
generated/
```

Generate:

```text
generated/nginx-site.conf
generated/Caddyfile
generated/nginx-proxy-manager.md
```

These files may contain the user's public domain and internal container details, so they must be ignored by Git.

Keep:

```text
generated/.gitkeep
```

tracked.

---

# Nginx reverse-proxy template

Create:

```text
templates/nginx-site.conf.template
```

Use variables such as:

```text
${PUBLIC_DOMAIN}
${ACCESSIBLE_PATH}
${SEERR_CONTAINER}
${SEERR_PORT}
```

The rendered configuration should follow this routing model:

```nginx
server {
    listen 443 ssl;
    server_name ${PUBLIC_DOMAIN};

    location = ${ACCESSIBLE_PATH} {
        return 301 ${ACCESSIBLE_PATH}/;
    }

    location ^~ ${ACCESSIBLE_PATH}/ {
        proxy_pass http://accessible-seerr:80/;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ^~ /api/ {
        proxy_pass http://${SEERR_CONTAINER}:${SEERR_PORT};

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://${SEERR_CONTAINER}:${SEERR_PORT};

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Preserve the trailing slash on:

```nginx
proxy_pass http://accessible-seerr:80/;
```

This strips the configured frontend prefix before forwarding to the static container.

The template must not include real TLS certificate locations.

Add comments indicating where the user or certificate manager should add TLS directives.

---

# Caddy template

Create:

```text
templates/caddyfile.template
```

Use this routing model:

```caddy
${PUBLIC_DOMAIN} {
    handle_path ${ACCESSIBLE_PATH}/* {
        reverse_proxy accessible-seerr:80
    }

    handle /api/* {
        reverse_proxy ${SEERR_CONTAINER}:${SEERR_PORT}
    }

    handle {
        reverse_proxy ${SEERR_CONTAINER}:${SEERR_PORT}
    }
}
```

Ensure the behavior for the path without a trailing slash is documented or handled.

Document that Caddy can usually manage HTTPS automatically when DNS and inbound ports are configured.

---

# Nginx Proxy Manager template

Create:

```text
templates/nginx-proxy-manager.md.template
```

This should provide accessible, step-by-step instructions for configuring:

* The main Seerr proxy host
* SSL
* Force SSL
* HTTP/2 if desired
* The custom `/api/` route
* The configurable accessible frontend route
* The frontend container hostname and port
* The Seerr container hostname and port

Use generated values from `.env`.

Do not assume a specific Nginx Proxy Manager version.

Clearly state that UI labels may differ between releases.

---

# Authentication

Use Seerr's local account authentication.

The login form should ask for:

* Email address
* Password

Send:

```text
POST /api/v1/auth/local
```

with JSON:

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Every authenticated request must use:

```javascript
credentials: "include"
```

The browser and Seerr should manage the session cookie.

Do not:

* Read the session cookie from JavaScript
* Store the password
* Store the session cookie
* Store credentials in localStorage
* Store credentials in sessionStorage
* Store credentials in IndexedDB
* Embed the global Seerr API key
* Log credentials
* Log cookies
* Put credentials in query strings

After successful login:

1. Clear the password field.
2. Hide the login section.
3. Show the authenticated interface.
4. Move focus to the search field.
5. Announce successful login in a polite live region.

---

# Existing session check

On initialization, check whether a valid Seerr session already exists.

Prefer:

```text
GET /api/v1/auth/me
```

If authenticated:

* Display the search interface
* Display the user's name or email only if returned safely and useful
* Do not ask the user to log in again

If unauthenticated:

* Display the login form
* Focus the email field when appropriate

If the endpoint differs in some Seerr versions, isolate it in a documented adapter function.

---

# Logout

Implement a logout button.

Use the supported Seerr logout endpoint where available.

Keep the endpoint and request method isolated in one function, such as:

```javascript
async function logoutFromSeerr()
```

If logout behavior varies by Seerr version:

* Document the expected endpoint
* Handle failure gracefully
* Clear only local UI state
* Do not attempt to delete HttpOnly cookies with JavaScript
* Tell the user when server-side logout could not be confirmed

After logout:

* Hide authenticated content
* Clear in-memory search and detail state
* Show the login form
* Move focus to the email field
* Announce that the user is signed out

---

# API endpoint configuration

Centralize endpoint paths in `app.js`.

Use a structure such as:

```javascript
const API_PATHS = Object.freeze({
  currentUser: "/api/v1/auth/me",
  localLogin: "/api/v1/auth/local",
  logout: "/api/v1/auth/logout",
  search: "/api/v1/search",
  movieDetails: "/api/v1/movie",
  televisionDetails: "/api/v1/tv",
  requests: "/api/v1/request"
});
```

Do not include:

```javascript
const SEERR_DOMAIN = "...";
const API_BASE_URL = "https://...";
```

A root-relative API base path is acceptable:

```javascript
const API_BASE_PATH = "/api/v1";
```

All API calls must remain same-origin.

---

# General API helper

Create a reusable API request helper.

It should:

* Use `credentials: "include"`
* Set `Accept: application/json`
* Add `Content-Type: application/json` only when sending JSON
* Detect empty responses
* Detect non-JSON responses
* Parse useful API error messages
* Detect 401
* Detect 403
* Handle 404 gracefully where version differences may exist
* Handle 409 duplicate/conflict responses
* Handle 429 rate limits
* Handle 500-level responses
* Handle network failures
* Avoid exposing stack traces
* Return predictable error objects or throw documented custom errors

Do not log sensitive request bodies.

Development logging must never include:

* Passwords
* Cookies
* Authorization headers
* API keys
* Full authenticated response payloads containing sensitive account data

---

# Application state

Keep application state centralized.

It may include:

```javascript
const state = {
  currentUser: null,
  authenticated: false,
  searchQuery: "",
  searchResults: [],
  selectedResult: null,
  selectedDetails: null,
  resultFocusId: null,
  requestInProgress: false,
  searchInProgress: false
};
```

Avoid uncontrolled global variables.

An intentionally scoped application object is acceptable.

Do not persist authenticated data in browser storage.

---

# Required page structure

Create one primary `<main>` landmark.

Include:

* Skip link
* Site heading
* Login section
* Authenticated navigation or account controls
* Search section
* Results section
* Details section
* Request controls
* Polite status live region
* Assertive error region

Use a logical heading hierarchy.

Suggested structure:

```text
Accessible Seerr — h1
Sign in — h2
Search — h2
Search results — h2
Media title — h2
Request television seasons — h3
```

Do not skip heading levels without reason.

---

# Accessibility requirements

Accessibility is the highest-priority product requirement.

Use semantic HTML before ARIA.

Use native controls wherever possible.

Do not use clickable `<div>` or `<span>` elements.

Every interactive control must have a meaningful accessible name.

Never create:

* An unlabeled button
* An unlabeled form field
* A button named only “Movie”
* A button named only “Series”
* A poster image as the only label
* An icon-only button without accessible text
* Nested interactive controls
* Positive `tabindex` values

Every form control must have a visible label.

Every validation message must be associated with its field where practical.

Use:

* `<form>`
* `<label>`
* `<input>`
* `<button>`
* `<a>`
* `<section>`
* `<article>`
* `<fieldset>`
* `<legend>`
* `<ul>`
* `<li>`
* `<dl>`
* `<dt>`
* `<dd>`

where appropriate.

Avoid excessive ARIA.

Do not add roles that duplicate native semantics.

---

# Skip link

Include a visible-on-focus skip link at the top:

```text
Skip to main content
```

It must move focus to the main content area.

---

# Screen-reader announcements

Provide two separate announcement regions:

1. Polite status updates:

```html
<div id="status-region" role="status" aria-live="polite" aria-atomic="true"></div>
```

2. Blocking errors:

```html
<div id="error-region" role="alert" aria-live="assertive" aria-atomic="true"></div>
```

Avoid announcing the same text repeatedly.

Clear or vary announcements when needed so VoiceOver reliably reads new updates.

Use concise messages such as:

```text
Searching for Breaking Bad.
12 results found.
Breaking Bad details loaded.
Request submitted for Breaking Bad.
Your session has expired. Please sign in again.
```

---

# Focus management

Move focus only after meaningful context changes.

Appropriate focus movements include:

* Login success → search field
* Login validation error → first invalid field
* Authentication failure → email or password field
* Search completion → results heading, when useful
* Opening details → details heading
* Returning from details → original result button
* Successful request → request status heading or confirmation
* Blocking error → error summary
* Logout → email field

Do not move focus for:

* Every loading-state update
* Every checkbox change
* Minor status changes
* Background refreshes

Store a stable identifier for the result control that opened details so focus can be restored.

---

# Keyboard support

The entire application must work using only:

* Tab
* Shift+Tab
* Enter
* Space
* Arrow keys where native controls support them
* Escape only if a modal is introduced

Avoid custom keyboard interaction patterns.

Do not implement fake listboxes, menus, or dialogs when standard controls are sufficient.

---

# Mobile and VoiceOver support

The interface must work well in iPhone Safari with VoiceOver.

Requirements:

* Mobile-first layout
* Large touch targets
* No hover-only controls
* No drag-only interactions
* No tiny icon buttons
* No horizontal scrolling at normal mobile widths
* Inputs sized to avoid accidental zoom where practical
* Clear form grouping
* Short, meaningful button labels
* Linear reading order
* No content hidden only visually while remaining unexpectedly focusable

Do not rely on poster images.

Posters may be omitted entirely.

---

# Login interface

Create a sign-in form containing:

* Email input
* Password input
* Sign-in button

Use appropriate attributes:

```html
<input type="email" autocomplete="username">
<input type="password" autocomplete="current-password">
```

Do not disable password manager support.

Do not prevent paste.

Do not add arbitrary password complexity requirements.

While signing in:

* Disable the submit button
* Change visible text to `Signing in…`
* Prevent duplicate submissions
* Announce progress

On failure:

* Restore the button
* Display a clear message
* Avoid revealing whether a specific account exists
* Focus the relevant control or error region

---

# Search interface

Create a search form with:

* Search input
* Search button
* Clear search button

Use:

```text
GET /api/v1/search?query=SEARCH_TERM&page=1
```

URL-encode the query.

The search input should use:

```html
type="search"
```

The visible label should be:

```text
Search movies and television series
```

During search:

* Disable the search button
* Change its text to `Searching…`
* Prevent duplicate simultaneous searches
* Announce the query
* Preserve the typed query

After search:

* Restore the button
* Announce the number of supported results
* Show a clear no-results message
* Handle partial or unusual responses gracefully

Validate empty and whitespace-only searches before calling the API.

The clear button should:

* Clear the input
* Clear results
* Clear details
* Return focus to the search field
* Announce that results were cleared

---

# Search result normalization

Seerr responses may use different field names for movies and television series.

Create helper functions including:

```javascript
getMediaTitle(result)
getMediaYear(result)
getMediaType(result)
getMediaTypeLabel(result)
getMediaDescription(result)
getMediaIdentifier(result)
getAvailabilityLabel(result)
getRequestStatusLabel(result)
```

Support title fields such as:

```javascript
result.title
result.name
result.originalTitle
result.originalName
```

Support date fields such as:

```javascript
result.releaseDate
result.firstAirDate
```

Support description fields such as:

```javascript
result.overview
```

Support type information such as:

```javascript
result.mediaType
```

Never display:

```text
undefined
null
NaN
```

Use safe fallback text such as:

```text
Title unavailable
Year unavailable
Status unknown
```

Prefer omitting unavailable optional information when that produces a cleaner result.

---

# Supported search result types

The first version must display:

* Movies
* Television series

Person results may be ignored.

If ignored, do not count them in the announced number of media results.

Unknown result types should be skipped safely.

Do not crash because one result is malformed.

---

# Search result markup

Render each result as an `<article>`.

Each result must expose the actual title to the accessibility tree.

A recommended structure is:

```html
<article>
  <h3>
    <button type="button">
      Open details for Breaking Bad, television series, 2008
    </button>
  </h3>

  <p>Television series</p>
  <p>First aired: 2008</p>
  <p>A chemistry teacher diagnosed with cancer...</p>
  <p>Status: Available</p>
</article>
```

The visible title should not be hidden behind an image.

The accessible name of the details control should include:

* Action
* Title
* Media type
* Year when available

Good examples:

```text
Open details for Breaking Bad, television series, 2008
Open details for Alien, movie, 1979
```

Bad examples:

```text
Movie
Series
Open
Details
Button
```

Use `textContent` or DOM node creation for API data.

Do not interpolate API data into `innerHTML`.

---

# Results pagination

Implement at least first-page search.

If pagination information is available and straightforward, add accessible:

* Previous page button
* Next page button
* Current page status

Do not fabricate pagination behavior.

If pagination is omitted in the first version, document it as a known limitation.

---

# Details view

When a result is activated, fetch details using:

```text
GET /api/v1/movie/{tmdbId}
GET /api/v1/tv/{tmdbId}
```

Render:

* Title
* Media type
* Release or first-air year
* Overview
* Genres
* Runtime for movies
* Number of seasons for television
* Existing availability state
* Existing request state
* Request controls
* Back-to-results button

Use a definition list where useful.

Do not remove search results from application state.

When the user returns:

* Restore the previous results
* Restore focus to the result button that opened details
* Preserve the search query
* Preserve the results page

---

# Details loading behavior

When loading details:

* Announce that details are loading
* Disable duplicate activations if needed
* Show visible loading text
* Do not leave an empty details region

After loading:

* Set the details heading text
* Move focus to the details heading
* Announce the title

On failure:

* Display a clear error
* Keep the back button available
* Allow retrying

---

# Movie requests

Use:

```text
POST /api/v1/request
```

A movie request body may resemble:

```json
{
  "mediaType": "movie",
  "mediaId": 550
}
```

Confirm actual field names against the Seerr API behavior available to the implementation.

Keep request-body creation in an adapter function:

```javascript
buildMovieRequestPayload(details)
```

Do not use the global API key.

Submit as the logged-in Seerr user.

While submitting:

* Disable the request button
* Change text to `Requesting…`
* Prevent duplicates
* Announce progress

After success:

* Announce the title
* Display the returned request status
* Disable or relabel the request button
* Update in-memory detail state

Handle already-requested media gracefully.

---

# Television requests

Television details must support season selection when required.

Render seasons inside:

```html
<fieldset>
  <legend>Select seasons to request</legend>
</fieldset>
```

Provide:

* One checkbox per season
* Select all available seasons button
* Clear selected seasons button
* Clear indication of already requested seasons
* Clear indication of unavailable or disabled seasons
* A request selected seasons button

Checkbox labels should be meaningful:

```text
Season 1
Season 2, already requested
Season 3, available to request
```

Do not use unlabeled numeric checkboxes.

A television request body may resemble:

```json
{
  "mediaType": "tv",
  "mediaId": 1396,
  "seasons": [1, 2, 3, 4, 5]
}
```

Keep this in an adapter function:

```javascript
buildTelevisionRequestPayload(details, selectedSeasons)
```

Validate that at least one requestable season is selected.

Focus the fieldset legend or validation message when selection is required.

---

# Optional Seerr request settings

Some Seerr configurations may require or expose:

* Server selection
* Quality profile
* Root folder
* Language profile
* Tags
* Requesting all seasons
* 4K selection

Prefer Seerr's configured defaults when the API allows them.

If the API explicitly requires selection:

* Fetch available options through Seerr
* Render native `<select>` controls
* Provide visible labels
* Explain required choices
* Never communicate directly with Sonarr or Radarr

Isolate version-specific settings logic.

Do not invent configuration values.

---

# Availability and request status

Translate API states into plain language.

Support labels such as:

* Available
* Partially available
* Not available
* Pending approval
* Approved
* Processing
* Downloading
* Already requested
* Request denied
* Failed
* Unknown status

Do not expose unexplained numeric status codes as the only status.

It is acceptable to include a numeric code in development diagnostics, but not as the primary user-facing message.

---

# Error handling

Implement a reusable error display function.

It should:

* Show visible error text
* Announce blocking errors assertively
* Move focus only for blocking errors
* Avoid duplicate announcements
* Avoid technical stack traces
* Preserve enough state to retry
* Distinguish authentication failures from network failures

Handle:

* Invalid credentials
* Expired session
* Permission denied
* Empty search
* No results
* Request conflict
* Duplicate request
* Rate limiting
* Missing media details
* Unsupported result types
* Malformed API responses
* Non-JSON responses
* Reverse-proxy errors
* Network failures
* Server errors

Example messages:

```text
Sign-in failed. Check your email address and password.
Your session has expired. Please sign in again.
Seerr denied this request for your account.
The server returned an unexpected response.
The request could not be completed because the network connection failed.
This title has already been requested.
```

---

# Session expiration

If an authenticated request returns 401:

1. Clear authenticated UI state.
2. Keep no sensitive data.
3. Show the login section.
4. Announce that the session expired.
5. Move focus to the email field.

For 403:

* Distinguish permission denial from expiration where possible
* Do not always log the user out unless the response indicates authentication loss

---

# Security requirements

The frontend must contain no secrets.

Do not include:

* Seerr API key
* Sonarr API key
* Radarr API key
* Jellyfin token
* Password
* Session cookie
* Private key
* OAuth client secret
* Hard-coded domain
* Hard-coded personal email

Do not use:

* `eval`
* `new Function`
* Inline event handlers
* Inline JavaScript
* `document.write`
* API-data `innerHTML`
* Third-party scripts
* External tracking
* Service workers
* Browser storage for authentication
* Query-string credentials

Use:

```javascript
element.textContent = value;
```

or explicit DOM creation.

Validate identifiers before including them in API paths.

Use `encodeURIComponent` for query values.

Do not treat client-side validation as a security boundary.

---

# Content Security Policy compatibility

All scripts must be external files served from the same origin.

All styles must be in `styles.css`.

Do not use:

```html
<script>
```

Do not use:

```html
style="..."
```

unless the CSP is intentionally adjusted, which should be avoided.

Do not use inline event handlers such as:

```html
<button onclick="search()">Search</button>
```

Register events with `addEventListener`.

---

# CSS and visual design

Create a simple, calm, high-contrast interface.

Use system fonts.

Do not use external fonts.

Requirements:

* Mobile-first
* Responsive
* Maximum readable content width
* Comfortable line spacing
* Large form controls
* Large touch targets
* Strong visible focus outlines
* Clear headings
* Clear section separation
* No background images
* No poster dependency
* No hover-only disclosure
* No color-only status indicators
* Light and dark color scheme support
* Reduced-motion support

Use:

```css
@media (prefers-color-scheme: dark)
```

and:

```css
@media (prefers-reduced-motion: reduce)
```

Do not disable focus outlines.

Use `:focus-visible` with a strong fallback where appropriate.

Ensure foreground/background contrast is suitable for WCAG AA.

---

# Hidden content

Provide a reusable visually-hidden class for screen-reader-only text.

Do not hide meaningful visible titles solely for visual styling.

Ensure hidden elements are not focusable unless intentionally active.

Use the native `hidden` attribute for inactive sections where appropriate.

When toggling sections:

* Update `hidden`
* Manage focus
* Avoid leaving interactive controls focusable in hidden content

---

# JavaScript organization

Use:

```javascript
"use strict";
```

Organize `public/app.js` into clearly marked sections:

1. Configuration
2. DOM references
3. Application state
4. API error types
5. API helpers
6. Authentication
7. Search
8. Result normalization
9. Result rendering
10. Media details
11. Request payload adapters
12. Request submission
13. Accessibility and focus helpers
14. Error and status handling
15. Event listeners
16. Initialization

Use:

* `const` by default
* `let` only when reassignment is required
* Small functions
* Descriptive names
* Guard clauses
* JSDoc comments for important functions
* Explicit error handling

Do not minify files.

Avoid functions that mix:

* Fetching
* State mutation
* Rendering
* Focus management

Separate these concerns when practical.

---

# Suggested helper functions

Implement or equivalent:

```javascript
apiRequest(path, options)
checkCurrentSession()
loginToSeerr(email, password)
logoutFromSeerr()
performSearch(query, page)
normalizeSearchResult(result)
renderSearchResults(results)
openMediaDetails(result)
fetchMediaDetails(mediaType, mediaId)
renderMediaDetails(details)
buildMovieRequestPayload(details)
buildTelevisionRequestPayload(details, seasons)
submitMediaRequest(payload)
getMediaTitle(item)
getMediaYear(item)
getMediaType(item)
getMediaTypeLabel(item)
getMediaDescription(item)
getMediaIdentifier(item)
getAvailabilityLabel(item)
getRequestStatusLabel(item)
announceStatus(message)
showError(message, options)
clearError()
moveFocusTo(element)
restoreResultFocus()
createElementWithText(tagName, text)
```

Names may differ, but responsibilities should remain clear.

---

# HTML requirements

`public/index.html` must include:

* `<!doctype html>`
* `lang="en"`
* UTF-8 charset
* Responsive viewport
* Descriptive page title
* Relative CSS path
* Relative deferred JavaScript path
* Skip link
* One main landmark
* Sign-in section
* Search section
* Results section
* Details section
* Status region
* Error region
* Logout control
* No inline scripts
* No inline styles
* No inline handlers

Use static labels in HTML where possible.

Create dynamic content safely in JavaScript.

---

# Static asset path requirements

Correct:

```html
<link rel="stylesheet" href="./styles.css">
<script src="./app.js" defer></script>
```

Incorrect:

```html
<link rel="stylesheet" href="/styles.css">
<script src="/app.js"></script>
```

The application must continue working when the reverse proxy exposes it at any configured path.

---

# README requirements

Create a complete `README.md`.

It must include:

## Project overview

Explain that Accessible Seerr is an alternative frontend for Seerr focused on screen-reader and keyboard accessibility.

State clearly that it is not a replacement for Seerr.

## Features

Document:

* Local-account login
* Existing-session reuse
* Accessible search results
* Movie details
* Television details
* Movie requests
* Season selection
* Session-cookie authentication
* Same-origin deployment
* Domain-independent Docker image
* Configurable deployment path

## Architecture

Explain:

```text
Browser
├── ACCESSIBLE_PATH/ → Accessible Seerr static frontend
└── /api/v1/        → Existing Seerr instance
```

Explain that all Sonarr, Radarr, Jellyfin, Prowlarr, and request configuration remains in Seerr.

## Security model

Explain:

* No API key in the browser
* No password storage
* Seerr session cookie authentication
* Same-origin requests
* HTTPS requirement
* Static frontend attack surface
* Environment-specific proxy files remain local
* Frontend does not receive `PUBLIC_DOMAIN`

## File structure

Describe every important file and directory.

## Prerequisites

Include:

* Existing Seerr instance
* Existing HTTPS reverse proxy
* Docker and Docker Compose
* Shared Docker network
* Local Seerr account
* A domain pointing to the reverse proxy

## Installation

Document:

```bash
git clone REPOSITORY_URL
cd accessible-seerr
cp .env.example .env
```

Then edit `.env`.

Then:

```bash
chmod +x scripts/configure.sh
./scripts/configure.sh
docker compose build
docker compose up -d
```

Also document:

```bash
./scripts/configure.sh --interactive
docker compose up -d --build
```

## Environment variables

Document:

```text
PUBLIC_DOMAIN
ACCESSIBLE_PATH
DOCKER_NETWORK
SEERR_CONTAINER
SEERR_PORT
```

Explain that `PUBLIC_DOMAIN` is not passed to the frontend.

## Reverse-proxy instructions

Include:

* Generated Nginx configuration
* Generated Caddy configuration
* Generated Nginx Proxy Manager guide
* Trailing-slash behavior
* Same-origin requirements
* API routing
* Frontend path routing
* Seerr root routing

## Domain independence

Include this statement:

> During setup, users configure their HTTPS hostname and deployment path in a local `.env` file or through the interactive configuration script. These values are used to generate reverse-proxy configuration and are never embedded in the frontend application. The browser client uses same-origin relative API URLs, so changing domains does not require rebuilding the application.

Also state:

> Accessible Seerr is domain-independent. It uses same-origin relative URLs and can be installed on any HTTPS hostname. No hostname is compiled into or stored by the frontend application.

## Authentication explanation

Explain:

* `/api/v1/auth/local`
* `/api/v1/auth/me`
* Browser-managed session cookie
* `credentials: "include"`
* No global API key
* No credential storage

## API endpoint summary

Document expected endpoints:

```text
GET  /api/v1/auth/me
POST /api/v1/auth/local
POST or GET /api/v1/auth/logout, depending on Seerr version
GET  /api/v1/search
GET  /api/v1/movie/{id}
GET  /api/v1/tv/{id}
POST /api/v1/request
```

Clearly note that endpoint behavior may vary between Seerr releases.

## Updating API mappings

Explain where endpoint constants and adapter functions live.

## Accessibility testing

Include instructions for:

* VoiceOver on iOS
* VoiceOver on macOS
* NVDA on Windows
* Keyboard-only testing
* Browser zoom
* Reduced motion
* Dark mode
* Heading navigation
* Form controls navigation
* Rotor navigation
* Live-region announcements

## Troubleshooting

Include:

* 404 on frontend assets
* Login succeeds in Seerr but not Accessible Seerr
* Session cookie not sent
* 401 responses
* 403 responses
* API requests routed to the frontend container
* Frontend path not stripped
* Docker network resolution failure
* CSP errors
* Blank search results
* Seerr response-shape differences
* Logout endpoint mismatch
* Incorrect trailing slash
* HTTPS and mixed-content errors

## Browser developer tools

Explain how to inspect:

* Network requests
* Response status codes
* Response JSON
* Cookies without exposing them publicly
* Console CSP errors

Warn users to redact:

* Cookies
* Account details
* Domains
* Internal service names
* Request payloads containing sensitive information

## Known limitations

Document any incomplete features honestly, such as:

* First-page-only search
* No person results
* Seerr version differences
* Optional request profiles not supported in every configuration
* No poster artwork
* Local accounts only, if that is the implemented scope

## Upgrade instructions

Explain:

```bash
git pull
docker compose build --pull
docker compose up -d
```

Mention reviewing release notes and re-running the configuration script when templates change.

## Uninstallation

Explain how to stop and remove the frontend without affecting Seerr:

```bash
docker compose down
```

State clearly that this does not remove Seerr data.

---

# Testing checklist

Include this checklist in the README and use it during implementation review.

## Setup and deployment

* `.env.example` contains placeholders only
* `.env` is ignored
* Generated proxy files are ignored
* Docker image builds
* Static container starts
* Container is reachable through the shared network
* Configured domain appears only in generated local files
* Configured frontend path routes correctly
* Frontend assets load under the configured path
* Seerr remains available at the root
* `/api/v1/` routes to Seerr
* HTTPS works

## Authentication

* Valid local login
* Invalid login
* Empty email
* Empty password
* Existing authenticated session
* Session expiration
* Permission denied
* Logout success
* Logout endpoint failure
* Password field clears after login
* Credentials are not stored

## Search

* Movie search
* Television search
* Empty search
* Whitespace-only search
* No results
* Malformed result
* Person results are ignored safely
* Network failure
* Server error
* Duplicate search submission
* Search button loading state
* Result count announcement

## Results accessibility

* Every result has a title
* Every details button has a meaningful name
* Media type is spoken
* Year is spoken where available
* No control is announced only as “button”
* No control is announced only as “movie” or “series”
* Heading navigation works
* Linear reading order makes sense
* Result status is understandable
* Missing fields do not display `undefined` or `null`

## Details

* Open movie details
* Open television details
* Details loading announcement
* Details failure
* Back to results
* Focus returns to original result
* Search state remains intact
* Genres are readable
* Runtime is readable
* Season count is readable
* Availability is readable

## Requests

* Request a movie
* Duplicate movie request
* Request pending approval
* Request approved automatically
* Select one television season
* Select multiple seasons
* Select all requestable seasons
* Clear selected seasons
* Submit with no seasons selected
* Already requested season
* Disabled season
* Duplicate submission prevention
* Request success announcement
* Request failure announcement
* Updated status after request

## Keyboard

* Complete use without mouse
* Logical Tab order
* Shift+Tab order
* Enter activates buttons
* Space activates buttons and checkboxes
* Focus visible everywhere
* No keyboard trap
* Skip link works
* Hidden sections are not focusable

## Screen readers

* VoiceOver iOS Safari
* VoiceOver macOS Safari
* NVDA Firefox
* NVDA Chrome
* Heading navigation
* Landmark navigation
* Form-control navigation
* Button navigation
* Live-region announcements
* Error announcements
* Result titles
* Season checkbox labels
* Focus restoration

## Visual and responsive behavior

* iPhone portrait
* iPhone landscape
* Narrow browser width
* 200 percent zoom
* Dark mode
* Light mode
* Reduced motion
* High contrast where supported
* Long titles
* Long descriptions
* Large system text

## Security

* No API key
* No hard-coded hostname
* No real email address
* No personal domain
* No real IP address
* No credential logging
* No cookie logging
* No `eval`
* No `innerHTML` for API data
* No inline scripts
* No inline event handlers
* CSP produces no expected-use violations
* Frontend API requests are same-origin
* Authenticated requests include credentials
* Password is never stored
* Generated local configuration is ignored

---

# `.gitignore`

Include at least:

```gitignore
# Local deployment configuration
.env
.env.*
!.env.example
docker-compose.override.yml

# Generated deployment files
generated/*
!generated/.gitkeep

# Local reverse-proxy configuration
nginx.local.conf
caddy.local.conf
traefik.local.yml

# Certificates and keys
certificates/
certs/
*.pem
*.key
*.p12
*.pfx

# Local notes and backups
*.local
*.bak
*.backup
*.swp
*~

# Operating-system files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
```

Do not ignore `CLAUDE.md`.

---

# `.dockerignore`

Exclude:

```text
.git
.gitignore
.env
.env.*
generated
templates
scripts
README.md
CLAUDE.md
docker-compose.yml
certificates
certs
*.pem
*.key
```

Ensure required runtime files are still copied.

---

# Privacy requirements

The public repository must contain no personal or environment-specific information.

Do not include:

* Real domains
* Real email addresses
* Real usernames
* Public IP addresses
* Private infrastructure IP addresses
* Real container names from a personal server
* Real Docker network names
* Real certificate paths
* API keys
* Passwords
* Tokens
* Cookies
* Personal comments
* Git remote URLs containing usernames

Use only:

```text
example.com
seerr.example.com
user@example.com
YOUR_DOMAIN
YOUR_DOCKER_NETWORK
REPOSITORY_URL
```

The user's `.env` and generated files must remain local.

Add this README warning:

> Your `.env` and generated reverse-proxy files may contain your public hostname and internal Docker service details. Review them before sharing logs or configuration publicly.

---

# Repository-wide privacy review

Before completing the project, search all tracked files for:

```text
http://
https://
@gmail.com
@outlook.com
@icloud.com
apiKey
api_key
password
secret
token
cookie
PRIVATE KEY
```

Review each match manually.

Expected matches may include:

* Generic `example.com` documentation
* Documentation links
* Explanations of password or cookie handling
* Placeholder values
* Security guidance

Confirm there is no real identifying information.

Also verify that no runtime API request contains an absolute hostname.

---

# Implementation review

After generating the project, perform a final review.

Confirm:

1. Every requested file exists.
2. The Docker image builds.
3. The application uses no frontend framework.
4. No package manager is required.
5. The frontend contains no API key.
6. The frontend contains no hard-coded domain.
7. The frontend contains no hard-coded deployment path.
8. Frontend assets use relative paths.
9. Seerr API requests use root-relative `/api/v1/` paths.
10. Authenticated requests use `credentials: "include"`.
11. Login uses the local-account endpoint.
12. Passwords are not stored.
13. API-provided text is never injected with `innerHTML`.
14. No button is unlabeled.
15. Search-result controls include the real title.
16. Focus management is intentional.
17. Live regions are present and useful.
18. Television seasons use labeled checkboxes.
19. Duplicate submissions are prevented.
20. The CSP requires no inline scripts.
21. `.env` is ignored.
22. Generated proxy files are ignored.
23. The public repository contains placeholders only.
24. Changing the domain requires no frontend rebuild.
25. Changing the accessible path requires no frontend rebuild.
26. The normal Seerr interface remains at the domain root.
27. `/api/` remains routed to Seerr.
28. The accessible path is routed only to the static frontend.
29. README instructions match the generated implementation.
30. Known limitations are documented honestly.

---

# Final Claude Code output

After creating the files:

1. Print the generated file tree.
2. Summarize the architecture.
3. List the Seerr API assumptions.
4. List any version-specific adapter functions.
5. Report the accessibility checks performed.
6. Report the privacy checks performed.
7. Report whether Docker configuration was syntax-checked.
8. Report any limitations that remain.
9. Do not print credentials, cookies, or local `.env` contents.
10. Do not claim testing that was not actually performed.

Generate complete, usable files now.
