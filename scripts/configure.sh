#!/usr/bin/env sh
#
# Accessible Seerr — deployment configuration script.
#
# Usage:
#   ./scripts/configure.sh                 Validate .env and (re)generate
#                                           reverse-proxy configuration.
#   ./scripts/configure.sh --interactive   Prompt for values, write .env,
#                                           then generate configuration.
#
# This script NEVER asks for and NEVER handles:
#   Seerr passwords, Seerr API keys, session cookies, TLS private keys,
#   Sonarr/Radarr/Jellyfin/Prowlarr credentials.
#
# It only handles deployment metadata: your public hostname, the frontend
# path, the shared Docker network name, and the Seerr container name/port.
# None of these values are passed into the Docker image or the frontend.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE_FILE="$PROJECT_ROOT/.env.example"
TEMPLATES_DIR="$PROJECT_ROOT/templates"
GENERATED_DIR="$PROJECT_ROOT/generated"

DEFAULT_ACCESSIBLE_PATH="/accessible"
DEFAULT_DOCKER_NETWORK="media"
DEFAULT_SEERR_CONTAINER="seerr"
DEFAULT_SEERR_PORT="5055"

INTERACTIVE=0

for arg in "$@"; do
  case "$arg" in
    --interactive)
      INTERACTIVE=1
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/configure.sh [--interactive]

Without arguments:
  Validates the existing .env file and (re)generates reverse-proxy
  configuration into generated/. Exits non-zero if .env is missing or
  invalid.

--interactive:
  Prompts for the public hostname, accessible frontend path, Docker
  network name, Seerr container name, and Seerr port. Writes or updates
  .env (with a warning before overwriting), then generates configuration.

This script never asks for passwords, API keys, cookies, or TLS keys.
USAGE
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# ============================================================
# Validation helpers
# ============================================================

# Accepts a bare hostname only: no protocol, no path, no port, no
# whitespace, no shell metacharacters. Example valid values:
#   seerr.example.com, requests.example.net, media.example.org
is_valid_domain() {
  _domain="$1"
  [ -n "$_domain" ] || return 1
  case "$_domain" in
    *[!a-zA-Z0-9.-]*) return 1 ;;
  esac
  case "$_domain" in
    .*|*.|-*|*-) return 1 ;;
  esac
  case "$_domain" in
    *..*) return 1 ;;
  esac
  return 0
}

# Must start with "/", must not be exactly "/", no query string, no
# fragment, no whitespace, no "..", no duplicate slashes. Trailing slash
# is allowed here and stripped separately before template rendering.
is_valid_path() {
  _path="$1"
  [ -n "$_path" ] || return 1
  [ "$_path" != "/" ] || return 1
  case "$_path" in
    /*) : ;;
    *) return 1 ;;
  esac
  case "$_path" in
    *[!a-zA-Z0-9/_-]*) return 1 ;;
  esac
  case "$_path" in
    *..*) return 1 ;;
  esac
  case "$_path" in
    *//*) return 1 ;;
  esac
  return 0
}

strip_trailing_slash() {
  _value="$1"
  case "$_value" in
    ?*/) printf '%s' "${_value%/}" ;;
    *) printf '%s' "$_value" ;;
  esac
}

# Docker network / container names: conservative charset matching Docker's
# own naming rules (letters, digits, underscore, period, hyphen).
is_valid_identifier() {
  _value="$1"
  [ -n "$_value" ] || return 1
  case "$_value" in
    *[!a-zA-Z0-9_.-]*) return 1 ;;
  esac
  return 0
}

is_valid_port() {
  _port="$1"
  case "$_port" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$_port" -ge 1 ] && [ "$_port" -le 65535 ]
}

# ============================================================
# Safe .env parsing (no `source`, no `eval`)
# ============================================================

# Prints the value for a given KEY=value line in a file. Ignores comments
# and blank lines. Strips one layer of matching surrounding quotes. Only
# ever reads — never executes — file contents.
get_env_value() {
  _key="$1"
  _file="$2"
  _found=""

  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      \#*|'') continue ;;
    esac
    case "$_line" in
      "$_key"=*)
        _found="${_line#*=}"
        ;;
    esac
  done < "$_file"

  case "$_found" in
    \"*\")
      _found="${_found#\"}"
      _found="${_found%\"}"
      ;;
    \'*\')
      _found="${_found#\'}"
      _found="${_found%\'}"
      ;;
  esac

  printf '%s' "$_found"
}

# ============================================================
# Template rendering
# ============================================================

render_template() {
  _template="$1"
  _output="$2"
  # Validated values never contain "|", "&", or backslashes, so a plain
  # sed substitution with a "|" delimiter is safe here.
  sed \
    -e "s|\${PUBLIC_DOMAIN}|$PUBLIC_DOMAIN|g" \
    -e "s|\${ACCESSIBLE_PATH}|$ACCESSIBLE_PATH|g" \
    -e "s|\${DOCKER_NETWORK}|$DOCKER_NETWORK|g" \
    -e "s|\${SEERR_CONTAINER}|$SEERR_CONTAINER|g" \
    -e "s|\${SEERR_PORT}|$SEERR_PORT|g" \
    "$_template" > "$_output"
}

generate_all() {
  mkdir -p "$GENERATED_DIR"

  render_template "$TEMPLATES_DIR/nginx-site.conf.template" "$GENERATED_DIR/nginx-site.conf"
  render_template "$TEMPLATES_DIR/caddyfile.template" "$GENERATED_DIR/Caddyfile"
  render_template "$TEMPLATES_DIR/nginx-proxy-manager.md.template" "$GENERATED_DIR/nginx-proxy-manager.md"

  printf '\nGenerated files:\n'
  printf '  %s\n' "$GENERATED_DIR/nginx-site.conf"
  printf '  %s\n' "$GENERATED_DIR/Caddyfile"
  printf '  %s\n' "$GENERATED_DIR/nginx-proxy-manager.md"

  printf '\nInstallation URLs:\n'
  printf '  Seerr interface:      https://%s/\n' "$PUBLIC_DOMAIN"
  printf '  Accessible interface: https://%s%s/\n' "$PUBLIC_DOMAIN" "$ACCESSIBLE_PATH"
  printf '  Seerr API:            https://%s/api/v1/\n' "$PUBLIC_DOMAIN"
  printf '\nThese generated files may contain your hostname and internal Docker\n'
  printf 'service names. They are ignored by Git — review before sharing.\n'
}

# ============================================================
# Noninteractive mode
# ============================================================

run_noninteractive() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'Error: %s does not exist.\n' "$ENV_FILE" >&2
    printf 'Run: cp .env.example .env\n' >&2
    printf 'Then edit .env, or run ./scripts/configure.sh --interactive\n' >&2
    exit 1
  fi

  PUBLIC_DOMAIN="$(get_env_value PUBLIC_DOMAIN "$ENV_FILE")"
  ACCESSIBLE_PATH="$(get_env_value ACCESSIBLE_PATH "$ENV_FILE")"
  DOCKER_NETWORK="$(get_env_value DOCKER_NETWORK "$ENV_FILE")"
  SEERR_CONTAINER="$(get_env_value SEERR_CONTAINER "$ENV_FILE")"
  SEERR_PORT="$(get_env_value SEERR_PORT "$ENV_FILE")"

  _has_error=0

  if ! is_valid_domain "$PUBLIC_DOMAIN"; then
    printf 'Error: PUBLIC_DOMAIN is invalid: "%s"\n' "$PUBLIC_DOMAIN" >&2
    printf '       Expected a bare hostname, e.g. seerr.example.com\n' >&2
    printf '       No protocol, path, port, or whitespace.\n' >&2
    _has_error=1
  fi

  if ! is_valid_path "$ACCESSIBLE_PATH"; then
    printf 'Error: ACCESSIBLE_PATH is invalid: "%s"\n' "$ACCESSIBLE_PATH" >&2
    printf '       Expected a path like /accessible (no query string, no "..").\n' >&2
    _has_error=1
  fi

  if ! is_valid_identifier "$DOCKER_NETWORK"; then
    printf 'Error: DOCKER_NETWORK is invalid: "%s"\n' "$DOCKER_NETWORK" >&2
    _has_error=1
  fi

  if ! is_valid_identifier "$SEERR_CONTAINER"; then
    printf 'Error: SEERR_CONTAINER is invalid: "%s"\n' "$SEERR_CONTAINER" >&2
    _has_error=1
  fi

  if ! is_valid_port "$SEERR_PORT"; then
    printf 'Error: SEERR_PORT is invalid: "%s"\n' "$SEERR_PORT" >&2
    printf '       Expected a number between 1 and 65535.\n' >&2
    _has_error=1
  fi

  if [ "$_has_error" -ne 0 ]; then
    printf '\nFix the values above in %s and re-run this script.\n' "$ENV_FILE" >&2
    exit 1
  fi

  ACCESSIBLE_PATH="$(strip_trailing_slash "$ACCESSIBLE_PATH")"

  generate_all
}

# ============================================================
# Interactive mode
# ============================================================

prompt_with_default() {
  _prompt="$1"
  _default="$2"
  _answer=""
  printf '%s [%s]: ' "$_prompt" "$_default" >&2
  IFS= read -r _answer || _answer=""
  if [ -z "$_answer" ]; then
    printf '%s' "$_default"
  else
    printf '%s' "$_answer"
  fi
}

run_interactive() {
  printf 'Accessible Seerr — interactive configuration\n\n'
  printf 'This will only ask for deployment metadata (hostname, path,\n'
  printf 'Docker network, container name, port). It will never ask for\n'
  printf 'passwords, API keys, cookies, or TLS keys.\n\n'

  while true; do
    _public_domain="$(prompt_with_default 'Public HTTPS hostname (e.g. seerr.example.com)' '')"
    if is_valid_domain "$_public_domain"; then
      break
    fi
    printf 'Invalid hostname. No protocol, path, port, or whitespace allowed.\n' >&2
  done

  while true; do
    _accessible_path="$(prompt_with_default 'Accessible frontend path' "$DEFAULT_ACCESSIBLE_PATH")"
    if is_valid_path "$_accessible_path"; then
      _accessible_path="$(strip_trailing_slash "$_accessible_path")"
      break
    fi
    printf 'Invalid path. Must start with "/", not be "/", and contain no "..".\n' >&2
  done

  while true; do
    _docker_network="$(prompt_with_default 'Existing Docker network name' "$DEFAULT_DOCKER_NETWORK")"
    if is_valid_identifier "$_docker_network"; then
      break
    fi
    printf 'Invalid network name.\n' >&2
  done

  while true; do
    _seerr_container="$(prompt_with_default 'Seerr container or service name' "$DEFAULT_SEERR_CONTAINER")"
    if is_valid_identifier "$_seerr_container"; then
      break
    fi
    printf 'Invalid container name.\n' >&2
  done

  while true; do
    _seerr_port="$(prompt_with_default 'Seerr internal port' "$DEFAULT_SEERR_PORT")"
    if is_valid_port "$_seerr_port"; then
      break
    fi
    printf 'Invalid port. Must be a number between 1 and 65535.\n' >&2
  done

  if [ -f "$ENV_FILE" ]; then
    printf '\nWarning: %s already exists.\n' "$ENV_FILE" >&2
    printf 'Overwrite it with the new values above? [y/N]: ' >&2
    IFS= read -r _confirm || _confirm=""
    case "$_confirm" in
      y|Y|yes|YES) : ;;
      *)
        printf 'Aborted. %s was not modified.\n' "$ENV_FILE" >&2
        exit 1
        ;;
    esac
  fi

  {
    printf '# Generated by scripts/configure.sh --interactive\n'
    printf '# Local deployment configuration. Do not commit this file.\n'
    printf 'PUBLIC_DOMAIN=%s\n' "$_public_domain"
    printf 'ACCESSIBLE_PATH=%s\n' "$_accessible_path"
    printf 'DOCKER_NETWORK=%s\n' "$_docker_network"
    printf 'SEERR_CONTAINER=%s\n' "$_seerr_container"
    printf 'SEERR_PORT=%s\n' "$_seerr_port"
  } > "$ENV_FILE"

  printf '\nWrote %s\n' "$ENV_FILE"

  PUBLIC_DOMAIN="$_public_domain"
  ACCESSIBLE_PATH="$_accessible_path"
  DOCKER_NETWORK="$_docker_network"
  SEERR_CONTAINER="$_seerr_container"
  SEERR_PORT="$_seerr_port"

  generate_all
}

# ============================================================
# Entry point
# ============================================================

if [ "$INTERACTIVE" -eq 1 ]; then
  run_interactive
else
  run_noninteractive
fi
