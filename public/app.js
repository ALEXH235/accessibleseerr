"use strict";

/**
 * Accessible Seerr — public/app.js
 *
 * A small, dependency-free client for an existing Seerr instance. This file
 * talks only to Seerr's own API using same-origin, credentialed requests.
 * It never talks to Sonarr, Radarr, Prowlarr, Jellyfin, Plex, or TMDB
 * directly, and it never stores credentials or session cookies itself —
 * the browser and Seerr manage the session cookie.
 *
 * Sections:
 *   1. Configuration
 *   2. DOM references
 *   3. Application state
 *   4. API error types
 *   5. API helpers
 *   6. Authentication
 *   7. Search
 *   8. Result normalization
 *   9. Result rendering
 *  10. Media details
 *  11. Request payload adapters
 *  12. Request submission
 *  13. Accessibility and focus helpers
 *  14. Error and status handling
 *  15. Event listeners
 *  16. Initialization
 */

/* ============================================================
   1. Configuration
   ============================================================ */

/**
 * Root-relative Seerr API paths. These are same-origin paths only — no
 * protocol, no hostname, no port is ever constructed here. Changing the
 * deployment domain never requires editing this file.
 */
const API_PATHS = Object.freeze({
  currentUser: "/api/v1/auth/me",
  jellyfinLogin: "/api/v1/auth/jellyfin",
  logout: "/api/v1/auth/logout",
  search: "/api/v1/search",
  movieDetails: "/api/v1/movie",
  televisionDetails: "/api/v1/tv",
  requests: "/api/v1/request"
});

/**
 * Seerr media availability status codes. Numeric codes are not stable
 * across every Seerr fork/version, so getAvailabilityLabel() always falls
 * back to a plain-language "Unknown status" rather than exposing a raw
 * number to the user.
 */
const MEDIA_STATUS_LABELS = Object.freeze({
  1: "Unknown status",
  2: "Pending approval",
  3: "Processing",
  4: "Partially available",
  5: "Available"
});

/** Seerr media request status codes. See note on MEDIA_STATUS_LABELS above. */
const REQUEST_STATUS_LABELS = Object.freeze({
  1: "Pending approval",
  2: "Approved",
  3: "Request denied"
});

const MEDIA_STATUS_AVAILABLE = 5;
const MEDIA_STATUS_UNKNOWN = 1;

/**
 * Opt-in diagnostic logging, enabled by loading the app with `?debug=1` in
 * the URL. This never logs credentials, cookies, or full account payloads —
 * only request methods/paths, response status codes, and the non-sensitive
 * fields needed to debug why a request did or did not reach Seerr (and, in
 * turn, Sonarr/Radarr). See debugLog() in the API helpers section.
 */
const DEBUG_LOGGING = new URLSearchParams(window.location.search).get("debug") === "1";

/* ============================================================
   2. DOM references
   ============================================================ */

const dom = {
  statusRegion: document.getElementById("status-region"),
  errorRegion: document.getElementById("error-region"),

  signInSection: document.getElementById("sign-in-section"),
  loginForm: document.getElementById("login-form"),
  loginUsername: document.getElementById("login-username"),
  loginPassword: document.getElementById("login-password"),
  loginUsernameError: document.getElementById("login-username-error"),
  loginPasswordError: document.getElementById("login-password-error"),
  loginSubmit: document.getElementById("login-submit"),

  accountSection: document.getElementById("account-section"),
  accountStatus: document.getElementById("account-status"),
  logoutButton: document.getElementById("logout-button"),

  searchSection: document.getElementById("search-section"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  searchSubmit: document.getElementById("search-submit"),
  searchClear: document.getElementById("search-clear"),

  resultsSection: document.getElementById("results-section"),
  resultsHeading: document.getElementById("results-heading"),
  resultsSummary: document.getElementById("results-summary"),
  resultsList: document.getElementById("results-list"),
  resultsPagination: document.getElementById("results-pagination"),
  resultsPrevPage: document.getElementById("results-prev-page"),
  resultsNextPage: document.getElementById("results-next-page"),
  resultsPageStatus: document.getElementById("results-page-status"),

  detailsSection: document.getElementById("details-section"),
  detailsBack: document.getElementById("details-back"),
  detailsHeading: document.getElementById("details-heading"),
  detailsLoading: document.getElementById("details-loading"),
  detailsContent: document.getElementById("details-content"),
  detailsList: document.getElementById("details-list"),
  requestSection: document.getElementById("request-section")
};

/* ============================================================
   3. Application state
   ============================================================ */

const state = {
  currentUser: null,
  authenticated: false,
  searchQuery: "",
  searchPage: 1,
  searchTotalPages: 1,
  searchResults: [],
  selectedResult: null,
  selectedDetails: null,
  resultFocusId: null,
  requestInProgress: false,
  searchInProgress: false,
  loginInProgress: false
};

/* ============================================================
   4. API error types
   ============================================================ */

class ApiError extends Error {
  constructor(message, { status = null, code = null, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class NetworkError extends ApiError {
  constructor(message = "The request could not be completed because the network connection failed.") {
    super(message, { code: "NETWORK_ERROR" });
    this.name = "NetworkError";
  }
}

class AuthenticationError extends ApiError {
  constructor(message = "Your session has expired. Please sign in again.", details = null) {
    super(message, { status: 401, code: "AUTHENTICATION_ERROR", details });
    this.name = "AuthenticationError";
  }
}

class PermissionError extends ApiError {
  constructor(message = "Seerr denied this request for your account.", details = null) {
    super(message, { status: 403, code: "PERMISSION_ERROR", details });
    this.name = "PermissionError";
  }
}

class NotFoundError extends ApiError {
  constructor(message = "The requested information could not be found.", details = null) {
    super(message, { status: 404, code: "NOT_FOUND", details });
    this.name = "NotFoundError";
  }
}

class ConflictError extends ApiError {
  constructor(message = "This title has already been requested.", details = null) {
    super(message, { status: 409, code: "CONFLICT", details });
    this.name = "ConflictError";
  }
}

class RateLimitError extends ApiError {
  constructor(message = "Too many requests were sent. Please wait a moment and try again.", details = null) {
    super(message, { status: 429, code: "RATE_LIMITED", details });
    this.name = "RateLimitError";
  }
}

class ServerError extends ApiError {
  constructor(message = "The server returned an unexpected response.", status = 500, details = null) {
    super(message, { status, code: "SERVER_ERROR", details });
    this.name = "ServerError";
  }
}

/* ============================================================
   5. API helpers
   ============================================================ */

/**
 * Extract a user-facing message from a Seerr JSON error body without
 * exposing internal details. Seerr versions vary in shape
 * ({message}, {error}, {errors: [...]}), so this checks common shapes.
 * @param {*} body
 * @returns {string|null}
 */
function extractApiMessage(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  if (typeof body.message === "string" && body.message.trim() !== "") {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.trim() !== "") {
    return body.error;
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first.message === "string") {
      return first.message;
    }
  }
  return null;
}

/**
 * Log a non-sensitive diagnostic message to the console when `?debug=1` is
 * present in the URL. Callers must never pass credentials, cookies, or full
 * account payloads — see the DEBUG_LOGGING declaration above.
 * @param {string} label
 * @param {object} [data]
 */
function debugLog(label, data) {
  if (!DEBUG_LOGGING) {
    return;
  }
  if (data === undefined) {
    console.log(`[Accessible Seerr] ${label}`);
  } else {
    console.log(`[Accessible Seerr] ${label}`, data);
  }
}

/** Keys that must never reach the console, even in debug mode. */
const SENSITIVE_BODY_KEYS = Object.freeze(["password", "cookie", "token", "apiKey", "authorization"]);

/**
 * Shallow-copy a request/response body for logging, replacing any sensitive
 * field values with a fixed placeholder rather than omitting the key, so the
 * shape of the payload stays visible for debugging.
 * @param {*} body
 * @returns {*}
 */
function redactSensitiveFields(body) {
  if (!body || typeof body !== "object") {
    return body;
  }
  const redacted = { ...body };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_BODY_KEYS.includes(key.toLowerCase())) {
      redacted[key] = "[redacted]";
    }
  }
  return redacted;
}

/**
 * Reusable Seerr API request helper. Always same-origin, always credentialed.
 * Never accepts an absolute URL — every path must be root-relative.
 *
 * @param {string} path Root-relative API path, e.g. "/api/v1/auth/me".
 * @param {RequestInit & { body?: object }} [options]
 * @returns {Promise<*>} Parsed JSON body, or null for empty responses.
 * @throws {ApiError}
 */
async function apiRequest(path, options = {}) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new ApiError("Invalid API path.", { code: "INVALID_PATH" });
  }

  const method = options.method || "GET";
  const headers = { Accept: "application/json" };
  let body;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  debugLog(
    `Request: ${method} ${path}`,
    options.body !== undefined ? { body: redactSensitiveFields(options.body) } : undefined
  );

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      credentials: "include"
    });
  } catch (networkFailure) {
    debugLog(`Network failure: ${method} ${path}`);
    throw new NetworkError();
  }

  debugLog(`Response: ${method} ${path} -> ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let parsedBody = null;
  if (response.status !== 204) {
    if (isJson) {
      try {
        const text = await response.text();
        parsedBody = text ? JSON.parse(text) : null;
      } catch (parseFailure) {
        parsedBody = null;
      }
    }
  }

  if (response.ok) {
    return parsedBody;
  }

  const apiMessage = extractApiMessage(parsedBody);

  switch (response.status) {
    case 401:
      throw new AuthenticationError(undefined, parsedBody);
    case 403:
      throw new PermissionError(apiMessage || undefined, parsedBody);
    case 404:
      throw new NotFoundError(apiMessage || undefined, parsedBody);
    case 409:
      throw new ConflictError(apiMessage || undefined, parsedBody);
    case 429:
      throw new RateLimitError(apiMessage || undefined, parsedBody);
    default:
      if (response.status >= 500) {
        throw new ServerError(apiMessage || undefined, response.status, parsedBody);
      }
      throw new ApiError(apiMessage || "The server returned an unexpected response.", {
        status: response.status,
        code: "REQUEST_FAILED",
        details: parsedBody
      });
  }
}

/* ============================================================
   6. Authentication
   ============================================================ */

/**
 * Check whether a valid Seerr session already exists.
 * Adapter note: some Seerr versions may return a slightly different user
 * shape from /api/v1/auth/me. This function only reads `id`, `username`,
 * `email`, and `displayName`, all of which are widely supported.
 */
async function checkCurrentSession() {
  try {
    const user = await apiRequest(API_PATHS.currentUser, { method: "GET" });
    if (user) {
      applyAuthenticatedState(user);
      showAuthenticatedHomeView({ moveFocus: false });
      return;
    }
    showLoginView({ announceExpired: false });
  } catch (error) {
    showLoginView({ announceExpired: false });
  }
}

/**
 * Sign in using a Jellyfin account, authenticated through Seerr's own
 * Jellyfin adapter endpoint. Seerr forwards the credentials to the Jellyfin
 * server it is configured against and, on success, starts a normal Seerr
 * session cookie — this project never talks to Jellyfin directly.
 * @param {string} username
 * @param {string} password
 */
async function loginToSeerr(username, password) {
  return apiRequest(API_PATHS.jellyfinLogin, {
    method: "POST",
    body: { username, password }
  });
}

/**
 * Log out of Seerr.
 *
 * Adapter note: Seerr has historically exposed logout as
 * `POST /api/v1/auth/logout`. If a given deployment responds 404/405 to
 * that method, this falls back to a GET request against the same path
 * before giving up. If neither succeeds, local UI state is still cleared
 * and the user is told that server-side logout could not be confirmed —
 * we never attempt to delete the HttpOnly session cookie from JavaScript.
 */
async function logoutFromSeerr() {
  try {
    await apiRequest(API_PATHS.logout, { method: "POST" });
    return { confirmed: true };
  } catch (postError) {
    if (postError instanceof NotFoundError || (postError.status !== null && postError.status === 405)) {
      try {
        await apiRequest(API_PATHS.logout, { method: "GET" });
        return { confirmed: true };
      } catch (getError) {
        return { confirmed: false };
      }
    }
    return { confirmed: false };
  }
}

/**
 * Apply a successful authentication result to application state.
 * @param {object} user
 */
function applyAuthenticatedState(user) {
  state.currentUser = user;
  state.authenticated = true;
}

/**
 * Clear all authenticated and in-memory search/detail state. Called on
 * logout and on session expiration. Never touches browser storage because
 * nothing sensitive is ever written there.
 */
function clearAuthenticatedState() {
  state.currentUser = null;
  state.authenticated = false;
  state.searchQuery = "";
  state.searchPage = 1;
  state.searchTotalPages = 1;
  state.searchResults = [];
  state.selectedResult = null;
  state.selectedDetails = null;
  state.resultFocusId = null;
  state.requestInProgress = false;
  state.searchInProgress = false;
}

/**
 * Handle a 401 received from any authenticated action after the user was
 * already signed in (as opposed to the initial session check, which
 * expects a 401 for guests and should not announce an "expiration").
 */
function handleSessionExpired() {
  const wasAuthenticated = state.authenticated;
  clearAuthenticatedState();
  showLoginView({ announceExpired: wasAuthenticated });
}

/* ============================================================
   7. Search
   ============================================================ */

/**
 * Run a Seerr search and update application state + UI.
 * @param {string} query
 * @param {number} [page]
 */
async function performSearch(query, page = 1) {
  const trimmed = query.trim();
  if (trimmed === "") {
    showError("Enter a movie or television title to search.", { focus: false });
    moveFocusTo(dom.searchInput);
    return;
  }

  if (state.searchInProgress) {
    return;
  }

  clearError();
  state.searchInProgress = true;
  state.searchQuery = trimmed;
  setSearchButtonBusy(true);
  announceStatus(`Searching for ${trimmed}.`);

  try {
    const url = `${API_PATHS.search}?query=${encodeURIComponent(trimmed)}&page=${encodeURIComponent(page)}`;
    const response = await apiRequest(url, { method: "GET" });

    const rawResults = Array.isArray(response && response.results) ? response.results : [];
    const normalized = [];
    for (const rawResult of rawResults) {
      const normalizedResult = normalizeSearchResult(rawResult);
      if (normalizedResult) {
        normalized.push(normalizedResult);
      }
    }

    state.searchResults = normalized;
    state.searchPage = Number.isInteger(response && response.page) ? response.page : page;
    state.searchTotalPages = Number.isInteger(response && response.totalPages) ? response.totalPages : 1;
    state.selectedResult = null;
    state.selectedDetails = null;

    renderSearchResults(normalized);
    showResultsView();

    if (normalized.length === 0) {
      announceStatus(`No movie or television results found for ${trimmed}.`);
    } else {
      announceStatus(`${normalized.length} result${normalized.length === 1 ? "" : "s"} found.`);
    }
  } catch (error) {
    handleActionError(error, "Search failed. Please try again.");
  } finally {
    state.searchInProgress = false;
    setSearchButtonBusy(false);
  }
}

function setSearchButtonBusy(isBusy) {
  dom.searchSubmit.disabled = isBusy;
  dom.searchSubmit.textContent = isBusy ? "Searching…" : "Search";
}

/* ============================================================
   8. Result normalization
   ============================================================ */

/**
 * @param {*} item A raw Seerr search result, movie, or tv object.
 * @returns {string}
 */
function getMediaTitle(item) {
  if (!item) {
    return "Title unavailable";
  }
  const candidates = [item.title, item.name, item.originalTitle, item.originalName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }
  return "Title unavailable";
}

/**
 * @param {*} item
 * @returns {string|null} A four-digit year, or null when unavailable.
 */
function getMediaYear(item) {
  if (!item) {
    return null;
  }
  const dateValue = item.releaseDate || item.firstAirDate;
  if (typeof dateValue !== "string" || dateValue.length < 4) {
    return null;
  }
  const year = dateValue.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/**
 * @param {*} item
 * @returns {"movie"|"tv"|"unknown"}
 */
function getMediaType(item) {
  if (item && item.mediaType === "movie") {
    return "movie";
  }
  if (item && item.mediaType === "tv") {
    return "tv";
  }
  return "unknown";
}

/**
 * @param {*} item
 * @returns {string}
 */
function getMediaTypeLabel(item) {
  const type = getMediaType(item);
  if (type === "movie") {
    return "Movie";
  }
  if (type === "tv") {
    return "Television series";
  }
  return "Unknown media type";
}

/**
 * @param {*} item
 * @returns {string|null}
 */
function getMediaDescription(item) {
  if (item && typeof item.overview === "string" && item.overview.trim() !== "") {
    return item.overview.trim();
  }
  return null;
}

/**
 * @param {*} item
 * @returns {number|null} The Seerr/TMDB numeric identifier.
 */
function getMediaIdentifier(item) {
  if (item && Number.isInteger(item.id) && item.id > 0) {
    return item.id;
  }
  return null;
}

/**
 * @param {number|null|undefined} statusCode
 * @returns {string}
 */
function getAvailabilityLabel(statusCode) {
  if (Number.isInteger(statusCode) && MEDIA_STATUS_LABELS[statusCode]) {
    return MEDIA_STATUS_LABELS[statusCode];
  }
  return "Status unknown";
}

/**
 * @param {number|null|undefined} statusCode
 * @returns {string}
 */
function getRequestStatusLabel(statusCode) {
  if (Number.isInteger(statusCode) && REQUEST_STATUS_LABELS[statusCode]) {
    return REQUEST_STATUS_LABELS[statusCode];
  }
  return "Status unknown";
}

/**
 * Normalize one raw search result into the shape the UI renders.
 * Person results and malformed entries are skipped by returning null.
 * @param {*} rawResult
 * @returns {object|null}
 */
function normalizeSearchResult(rawResult) {
  try {
    const mediaType = getMediaType(rawResult);
    if (mediaType === "unknown") {
      return null;
    }
    const id = getMediaIdentifier(rawResult);
    if (id === null) {
      return null;
    }

    const mediaInfo = rawResult && typeof rawResult.mediaInfo === "object" ? rawResult.mediaInfo : null;
    const availabilityStatus = mediaInfo && Number.isInteger(mediaInfo.status) ? mediaInfo.status : null;

    return {
      raw: rawResult,
      mediaType,
      id,
      title: getMediaTitle(rawResult),
      year: getMediaYear(rawResult),
      description: getMediaDescription(rawResult),
      availabilityStatus,
      availabilityLabel: getAvailabilityLabel(availabilityStatus)
    };
  } catch (normalizationError) {
    return null;
  }
}

/* ============================================================
   9. Result rendering
   ============================================================ */

/**
 * @param {string} tagName
 * @param {string} text
 * @returns {HTMLElement}
 */
function createElementWithText(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

/**
 * @param {object[]} results Normalized search results.
 */
function renderSearchResults(results) {
  dom.resultsList.innerHTML = "";

  results.forEach((result, index) => {
    const item = document.createElement("li");
    item.className = "result-item";

    const article = document.createElement("article");

    const heading = document.createElement("h3");
    const button = document.createElement("button");
    button.type = "button";
    button.id = `result-open-${index}`;
    button.dataset.resultIndex = String(index);

    const namePieces = [`Open details for ${result.title}`, getMediaTypeLabel(result.raw).toLowerCase()];
    if (result.year) {
      namePieces.push(result.year);
    }
    button.textContent = namePieces.join(", ");
    heading.appendChild(button);
    article.appendChild(heading);

    article.appendChild(createElementWithText("p", getMediaTypeLabel(result.raw)));

    if (result.year) {
      const label = result.mediaType === "tv" ? "First aired" : "Released";
      article.appendChild(createElementWithText("p", `${label}: ${result.year}`));
    }

    if (result.description) {
      const description = document.createElement("p");
      description.className = "result-meta";
      description.textContent = result.description;
      article.appendChild(description);
    }

    article.appendChild(createElementWithText("p", `Status: ${result.availabilityLabel}`));

    item.appendChild(article);
    dom.resultsList.appendChild(item);
  });

  dom.resultsSummary.textContent =
    results.length === 0
      ? `No results found for ${state.searchQuery}.`
      : `${results.length} result${results.length === 1 ? "" : "s"} for ${state.searchQuery}.`;

  const showPagination = state.searchTotalPages > 1;
  dom.resultsPagination.hidden = !showPagination;
  if (showPagination) {
    dom.resultsPrevPage.disabled = state.searchPage <= 1;
    dom.resultsNextPage.disabled = state.searchPage >= state.searchTotalPages;
    dom.resultsPageStatus.textContent = `Page ${state.searchPage} of ${state.searchTotalPages}`;
  }
}

/* ============================================================
   10. Media details
   ============================================================ */

/**
 * @param {"movie"|"tv"} mediaType
 * @param {number} mediaId
 */
async function fetchMediaDetails(mediaType, mediaId) {
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new ApiError("Invalid media identifier.", { code: "INVALID_ID" });
  }
  const basePath = mediaType === "movie" ? API_PATHS.movieDetails : API_PATHS.televisionDetails;
  return apiRequest(`${basePath}/${encodeURIComponent(mediaId)}`, { method: "GET" });
}

/**
 * Open the details view for a search result.
 * @param {object} result Normalized search result.
 * @param {HTMLElement} triggerButton The button that opened details, so
 *   focus can be restored to it later.
 */
async function openMediaDetails(result, triggerButton) {
  state.selectedResult = result;
  state.resultFocusId = triggerButton ? triggerButton.id : null;

  showDetailsView();
  dom.detailsHeading.textContent = "Media details";
  dom.detailsContent.hidden = true;
  dom.detailsLoading.hidden = false;
  announceStatus("Loading details.");
  clearError();

  try {
    const details = await fetchMediaDetails(result.mediaType, result.id);
    state.selectedDetails = details;
    renderMediaDetails(details, result.mediaType);
    dom.detailsLoading.hidden = true;
    dom.detailsContent.hidden = false;
    moveFocusTo(dom.detailsHeading);
    announceStatus(`${getMediaTitle(details)} details loaded.`);
  } catch (error) {
    dom.detailsLoading.hidden = true;
    handleActionError(error, "This title's details could not be loaded.");
  }
}

/**
 * @param {object} details
 * @param {"movie"|"tv"} mediaType
 */
function renderMediaDetails(details, mediaType) {
  const title = getMediaTitle(details);
  dom.detailsHeading.textContent = title;

  dom.detailsList.innerHTML = "";

  const addRow = (term, value) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    dom.detailsList.appendChild(createElementWithText("dt", term));
    dom.detailsList.appendChild(createElementWithText("dd", String(value)));
  };

  addRow("Media type", mediaType === "movie" ? "Movie" : "Television series");
  addRow(mediaType === "movie" ? "Released" : "First aired", getMediaYear(details));
  addRow("Overview", getMediaDescription(details) || "No overview available.");

  const genres = Array.isArray(details.genres)
    ? details.genres.map((genre) => (genre && typeof genre.name === "string" ? genre.name : null)).filter(Boolean)
    : [];
  if (genres.length > 0) {
    addRow("Genres", genres.join(", "));
  }

  if (mediaType === "movie" && Number.isInteger(details.runtime) && details.runtime > 0) {
    addRow("Runtime", `${details.runtime} minutes`);
  }

  if (mediaType === "tv" && Array.isArray(details.seasons)) {
    const seasonCount = details.seasons.filter((season) => season && season.seasonNumber > 0).length;
    addRow("Seasons", seasonCount);
  }

  const mediaInfo = details && typeof details.mediaInfo === "object" ? details.mediaInfo : null;
  const availabilityStatus = mediaInfo && Number.isInteger(mediaInfo.status) ? mediaInfo.status : null;
  addRow("Availability", getAvailabilityLabel(availabilityStatus));

  renderRequestControls(details, mediaType);
}

/* ============================================================
   11. Request payload adapters
   ============================================================ */

/**
 * @param {object} details
 * @returns {{mediaType: "movie", mediaId: number}}
 */
function buildMovieRequestPayload(details) {
  return {
    mediaType: "movie",
    mediaId: getMediaIdentifier(details)
  };
}

/**
 * @param {object} details
 * @param {number[]} selectedSeasons
 * @returns {{mediaType: "tv", mediaId: number, seasons: number[]}}
 */
function buildTelevisionRequestPayload(details, selectedSeasons) {
  return {
    mediaType: "tv",
    mediaId: getMediaIdentifier(details),
    seasons: selectedSeasons.slice().sort((a, b) => a - b)
  };
}

/* ============================================================
   12. Request submission
   ============================================================ */

/**
 * @param {object} payload
 * @returns {Promise<*>}
 */
async function submitMediaRequest(payload) {
  const result = await apiRequest(API_PATHS.requests, { method: "POST", body: payload });

  // Diagnostic only (enabled via ?debug=1): if a request never reaches
  // Sonarr/Radarr, the cause is almost always on Seerr's side rather than
  // in this frontend, since this project never talks to Sonarr/Radarr
  // directly. The two most common causes are (1) the request landing in
  // "Pending Approval" and waiting on a Seerr admin, or (2) Seerr itself
  // failing to hand the approved request to Sonarr/Radarr, which only
  // appears in Seerr's own server logs. This log shows what Seerr reported
  // back immediately after accepting the request, without exposing any
  // account data beyond the request/media status.
  debugLog("Request created", {
    requestId: result && result.id,
    requestStatus: result && result.status,
    mediaId: result && result.media && result.media.id,
    mediaStatus: result && result.media && result.media.status,
    seasons: Array.isArray(result && result.seasons)
      ? result.seasons.map((season) => season && season.seasonNumber)
      : undefined
  });

  return result;
}

/**
 * Render movie or television request controls into #request-section.
 * Rebuilds the section from scratch on every call so it always reflects
 * the latest known state.
 * @param {object} details
 * @param {"movie"|"tv"} mediaType
 */
function renderRequestControls(details, mediaType) {
  dom.requestSection.innerHTML = "";

  const mediaInfo = details && typeof details.mediaInfo === "object" ? details.mediaInfo : null;
  const status = mediaInfo && Number.isInteger(mediaInfo.status) ? mediaInfo.status : MEDIA_STATUS_UNKNOWN;
  const existingRequests = mediaInfo && Array.isArray(mediaInfo.requests) ? mediaInfo.requests : [];
  const latestRequest = existingRequests.length > 0 ? existingRequests[existingRequests.length - 1] : null;

  if (mediaType === "movie") {
    renderMovieRequestControls(details, status, latestRequest);
  } else {
    renderTelevisionRequestControls(details, mediaInfo);
  }
}

function renderMovieRequestControls(details, status, latestRequest) {
  const heading = document.createElement("h3");
  heading.textContent = "Request this movie";
  dom.requestSection.appendChild(heading);

  if (status === MEDIA_STATUS_AVAILABLE) {
    dom.requestSection.appendChild(createElementWithText("p", "This movie is already available."));
    return;
  }

  if (latestRequest) {
    const statusText = document.createElement("p");
    statusText.className = "request-status";
    statusText.textContent = `Request status: ${getRequestStatusLabel(latestRequest.status)}`;
    dom.requestSection.appendChild(statusText);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.id = "movie-request-button";
  button.dataset.action = "request-movie";
  button.textContent = latestRequest ? "Already requested" : "Request movie";
  button.disabled = Boolean(latestRequest);
  dom.requestSection.appendChild(button);
}

function renderTelevisionRequestControls(details, mediaInfo) {
  const heading = document.createElement("h3");
  heading.textContent = "Request television seasons";
  dom.requestSection.appendChild(heading);

  const seasons = Array.isArray(details.seasons)
    ? details.seasons.filter((season) => season && Number.isInteger(season.seasonNumber) && season.seasonNumber > 0)
    : [];

  if (seasons.length === 0) {
    dom.requestSection.appendChild(createElementWithText("p", "No requestable seasons were returned by Seerr."));
    return;
  }

  const seasonInfoByNumber = new Map();
  if (mediaInfo && Array.isArray(mediaInfo.seasons)) {
    for (const seasonInfo of mediaInfo.seasons) {
      if (seasonInfo && Number.isInteger(seasonInfo.seasonNumber)) {
        seasonInfoByNumber.set(seasonInfo.seasonNumber, seasonInfo);
      }
    }
  }

  const form = document.createElement("form");
  form.id = "season-request-form";
  form.noValidate = true;

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.id = "season-fieldset-legend";
  legend.tabIndex = -1;
  legend.textContent = "Select seasons to request";
  fieldset.appendChild(legend);

  const validationMessage = document.createElement("p");
  validationMessage.id = "season-validation-message";
  validationMessage.className = "field-error";
  validationMessage.hidden = true;
  fieldset.appendChild(validationMessage);

  seasons.forEach((season) => {
    const seasonNumber = season.seasonNumber;
    const seasonInfo = seasonInfoByNumber.get(seasonNumber);
    const seasonStatus = seasonInfo && Number.isInteger(seasonInfo.status) ? seasonInfo.status : null;

    const wrapper = document.createElement("div");
    wrapper.className = "season-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `season-checkbox-${seasonNumber}`;
    checkbox.name = "season";
    checkbox.value = String(seasonNumber);

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;

    let labelText = `Season ${seasonNumber}`;
    if (seasonStatus === MEDIA_STATUS_AVAILABLE) {
      labelText += ", already available";
      checkbox.disabled = true;
    } else if (seasonStatus === 2 || seasonStatus === 3) {
      labelText += ", already requested";
      checkbox.disabled = true;
    } else {
      labelText += ", available to request";
    }
    label.textContent = labelText;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    fieldset.appendChild(wrapper);
  });

  form.appendChild(fieldset);

  const buttonRow = document.createElement("div");
  buttonRow.className = "button-row";

  const selectAllButton = document.createElement("button");
  selectAllButton.type = "button";
  selectAllButton.dataset.action = "select-all-seasons";
  selectAllButton.className = "secondary";
  selectAllButton.textContent = "Select all available seasons";
  buttonRow.appendChild(selectAllButton);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.dataset.action = "clear-seasons";
  clearButton.className = "secondary";
  clearButton.textContent = "Clear selected seasons";
  buttonRow.appendChild(clearButton);

  form.appendChild(buttonRow);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.id = "season-request-submit";
  submitButton.textContent = "Request selected seasons";
  form.appendChild(submitButton);

  dom.requestSection.appendChild(form);
}

/**
 * Handle the "Request movie" button.
 */
async function handleMovieRequestSubmit() {
  if (state.requestInProgress || !state.selectedDetails) {
    return;
  }
  const button = document.getElementById("movie-request-button");
  const title = getMediaTitle(state.selectedDetails);

  state.requestInProgress = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Requesting…";
  }
  announceStatus(`Requesting ${title}.`);
  clearError();

  try {
    await submitMediaRequest(buildMovieRequestPayload(state.selectedDetails));
    announceStatus(`Request submitted for ${title}.`);
    const refreshed = await fetchMediaDetails("movie", getMediaIdentifier(state.selectedDetails));
    state.selectedDetails = refreshed;
    renderRequestControls(refreshed, "movie");
  } catch (error) {
    if (error instanceof ConflictError) {
      showError("This title has already been requested.", { focus: false });
      if (button) {
        button.disabled = true;
        button.textContent = "Already requested";
      }
    } else {
      handleActionError(error, "The request could not be submitted.");
      if (button) {
        button.disabled = false;
        button.textContent = "Request movie";
      }
    }
  } finally {
    state.requestInProgress = false;
  }
}

/**
 * Handle the season-request form submission.
 * @param {HTMLFormElement} form
 */
async function handleTelevisionRequestSubmit(form) {
  if (state.requestInProgress || !state.selectedDetails) {
    return;
  }

  const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]:not(:disabled)'));
  const selectedSeasons = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => Number(checkbox.value));

  const validationMessage = document.getElementById("season-validation-message");

  if (selectedSeasons.length === 0) {
    if (validationMessage) {
      validationMessage.textContent = "Select at least one season to request.";
      validationMessage.hidden = false;
    }
    const legend = document.getElementById("season-fieldset-legend");
    moveFocusTo(legend);
    return;
  }

  if (validationMessage) {
    validationMessage.hidden = true;
  }

  const submitButton = document.getElementById("season-request-submit");
  const title = getMediaTitle(state.selectedDetails);

  state.requestInProgress = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Requesting…";
  }
  announceStatus(`Requesting selected seasons of ${title}.`);
  clearError();

  try {
    await submitMediaRequest(buildTelevisionRequestPayload(state.selectedDetails, selectedSeasons));
    announceStatus(`Request submitted for ${title}.`);
    const refreshed = await fetchMediaDetails("tv", getMediaIdentifier(state.selectedDetails));
    state.selectedDetails = refreshed;
    renderRequestControls(refreshed, "tv");
  } catch (error) {
    if (error instanceof ConflictError) {
      showError("One or more selected seasons have already been requested.", { focus: false });
    } else {
      handleActionError(error, "The request could not be submitted.");
    }
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Request selected seasons";
    }
  } finally {
    state.requestInProgress = false;
  }
}

/* ============================================================
   13. Accessibility and focus helpers
   ============================================================ */

/**
 * Move focus to an element, temporarily making it focusable if it is not
 * already an interactive control (e.g. a heading used as a focus target).
 * @param {HTMLElement|null} element
 */
function moveFocusTo(element) {
  if (!element) {
    return;
  }
  const isNativelyFocusable = element.matches(
    "a[href], button, input, select, textarea, [tabindex]"
  );
  if (!isNativelyFocusable) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus();
}

/**
 * Restore focus to the search result button that originally opened the
 * currently active details view.
 */
function restoreResultFocus() {
  if (!state.resultFocusId) {
    moveFocusTo(dom.resultsHeading);
    return;
  }
  const target = document.getElementById(state.resultFocusId);
  moveFocusTo(target || dom.resultsHeading);
}

/* ============================================================
   14. Error and status handling
   ============================================================ */

let statusResetTimer = null;

/**
 * Announce a message through the polite live region. Clears first so that
 * repeated identical messages are still read by screen readers.
 * @param {string} message
 */
function announceStatus(message) {
  dom.statusRegion.textContent = "";
  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
  }
  statusResetTimer = setTimeout(() => {
    dom.statusRegion.textContent = message;
  }, 50);
}

/**
 * Display a blocking error message assertively.
 * @param {string} message
 * @param {{focus?: boolean}} [options]
 */
function showError(message, { focus = true } = {}) {
  dom.errorRegion.hidden = false;
  dom.errorRegion.textContent = "";
  setTimeout(() => {
    dom.errorRegion.textContent = message;
    if (focus) {
      moveFocusTo(dom.errorRegion);
    }
  }, 20);
}

function clearError() {
  dom.errorRegion.hidden = true;
  dom.errorRegion.textContent = "";
}

/**
 * Central handler for errors raised by authenticated actions (search,
 * details, requests). Distinguishes session expiration and permission
 * denial from generic failures.
 * @param {*} error
 * @param {string} fallbackMessage
 */
function handleActionError(error, fallbackMessage) {
  if (error instanceof AuthenticationError) {
    handleSessionExpired();
    return;
  }
  if (error instanceof PermissionError) {
    showError(error.message || "Seerr denied this request for your account.", { focus: false });
    return;
  }
  if (error instanceof RateLimitError) {
    showError(error.message, { focus: false });
    return;
  }
  if (error instanceof NetworkError) {
    showError(error.message, { focus: false });
    return;
  }
  if (error instanceof ApiError) {
    showError(error.message || fallbackMessage, { focus: false });
    return;
  }
  showError(fallbackMessage, { focus: false });
}

/* ---------- View state management ---------- */

function showLoginView({ announceExpired }) {
  dom.signInSection.hidden = false;
  dom.accountSection.hidden = true;
  dom.searchSection.hidden = true;
  dom.resultsSection.hidden = true;
  dom.detailsSection.hidden = true;

  if (announceExpired) {
    announceStatus("Your session has expired. Please sign in again.");
  }
  moveFocusTo(dom.loginUsername);
}

function showAuthenticatedHomeView({ moveFocus }) {
  dom.signInSection.hidden = true;
  dom.accountSection.hidden = false;
  dom.searchSection.hidden = false;
  dom.detailsSection.hidden = true;
  dom.resultsSection.hidden = state.searchResults.length === 0;

  const username =
    state.currentUser && typeof state.currentUser.username === "string" ? state.currentUser.username : null;
  const email = state.currentUser && typeof state.currentUser.email === "string" ? state.currentUser.email : null;
  const displayName =
    state.currentUser && typeof state.currentUser.displayName === "string" ? state.currentUser.displayName : null;
  const accountLabel = displayName || username || email;
  dom.accountStatus.textContent = accountLabel ? `Signed in as ${accountLabel}.` : "Signed in.";

  if (moveFocus) {
    moveFocusTo(dom.searchInput);
  }
}

function showResultsView() {
  dom.detailsSection.hidden = true;
  dom.resultsSection.hidden = false;
}

function showDetailsView() {
  dom.searchSection.hidden = true;
  dom.resultsSection.hidden = true;
  dom.detailsSection.hidden = false;
}

function returnToResultsFromDetails() {
  dom.detailsSection.hidden = true;
  dom.searchSection.hidden = false;
  dom.resultsSection.hidden = state.searchResults.length === 0;
  restoreResultFocus();
}

/* ============================================================
   15. Event listeners
   ============================================================ */

function clearFieldError(inputElement, errorElement) {
  inputElement.removeAttribute("aria-invalid");
  errorElement.hidden = true;
  errorElement.textContent = "";
}

function setFieldError(inputElement, errorElement, message) {
  inputElement.setAttribute("aria-invalid", "true");
  errorElement.hidden = false;
  errorElement.textContent = message;
}

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.loginInProgress) {
    return;
  }

  clearFieldError(dom.loginUsername, dom.loginUsernameError);
  clearFieldError(dom.loginPassword, dom.loginPasswordError);
  clearError();

  const username = dom.loginUsername.value.trim();
  const password = dom.loginPassword.value;

  let hasValidationError = false;
  if (username === "") {
    setFieldError(dom.loginUsername, dom.loginUsernameError, "Enter your Jellyfin username.");
    hasValidationError = true;
  }
  if (password === "") {
    setFieldError(dom.loginPassword, dom.loginPasswordError, "Enter your password.");
    hasValidationError = true;
  }
  if (hasValidationError) {
    moveFocusTo(username === "" ? dom.loginUsername : dom.loginPassword);
    return;
  }

  state.loginInProgress = true;
  dom.loginSubmit.disabled = true;
  dom.loginSubmit.textContent = "Signing in…";
  announceStatus("Signing in.");

  try {
    const user = await loginToSeerr(username, password);
    dom.loginPassword.value = "";
    applyAuthenticatedState(user || {});
    showAuthenticatedHomeView({ moveFocus: true });
    announceStatus("Signed in successfully.");
  } catch (error) {
    dom.loginPassword.value = "";
    if (error instanceof AuthenticationError || error instanceof PermissionError) {
      showError("Sign-in failed. Check your Jellyfin username and password.", { focus: false });
    } else if (error instanceof NetworkError) {
      showError(error.message, { focus: false });
    } else {
      showError("Sign-in failed. Please try again.", { focus: false });
    }
    moveFocusTo(dom.loginUsername);
  } finally {
    state.loginInProgress = false;
    dom.loginSubmit.disabled = false;
    dom.loginSubmit.textContent = "Sign in";
  }
});

dom.logoutButton.addEventListener("click", async () => {
  dom.logoutButton.disabled = true;
  const result = await logoutFromSeerr();
  clearAuthenticatedState();
  showLoginView({ announceExpired: false });
  dom.logoutButton.disabled = false;

  if (result.confirmed) {
    announceStatus("You have been signed out.");
  } else {
    announceStatus("You have been signed out locally. Server-side sign-out could not be confirmed.");
  }
});

dom.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  performSearch(dom.searchInput.value, 1);
});

dom.searchClear.addEventListener("click", () => {
  dom.searchInput.value = "";
  state.searchResults = [];
  state.selectedResult = null;
  state.selectedDetails = null;
  dom.resultsList.innerHTML = "";
  dom.resultsSummary.textContent = "";
  dom.resultsPagination.hidden = true;
  dom.resultsSection.hidden = true;
  dom.detailsSection.hidden = true;
  dom.searchSection.hidden = false;
  clearError();
  moveFocusTo(dom.searchInput);
  announceStatus("Search results cleared.");
});

dom.resultsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-result-index]");
  if (!button) {
    return;
  }
  const index = Number(button.dataset.resultIndex);
  const result = state.searchResults[index];
  if (result) {
    openMediaDetails(result, button);
  }
});

dom.resultsPrevPage.addEventListener("click", () => {
  if (state.searchPage > 1) {
    performSearch(state.searchQuery, state.searchPage - 1);
  }
});

dom.resultsNextPage.addEventListener("click", () => {
  if (state.searchPage < state.searchTotalPages) {
    performSearch(state.searchQuery, state.searchPage + 1);
  }
});

dom.detailsBack.addEventListener("click", () => {
  returnToResultsFromDetails();
});

dom.requestSection.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  if (actionButton.dataset.action === "request-movie") {
    handleMovieRequestSubmit();
    return;
  }

  if (actionButton.dataset.action === "select-all-seasons") {
    const form = document.getElementById("season-request-form");
    if (form) {
      form.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((checkbox) => {
        checkbox.checked = true;
      });
    }
    return;
  }

  if (actionButton.dataset.action === "clear-seasons") {
    const form = document.getElementById("season-request-form");
    if (form) {
      form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
      });
    }
  }
});

dom.requestSection.addEventListener("submit", (event) => {
  if (event.target && event.target.id === "season-request-form") {
    event.preventDefault();
    handleTelevisionRequestSubmit(event.target);
  }
});

/* ============================================================
   16. Initialization
   ============================================================ */

checkCurrentSession();
