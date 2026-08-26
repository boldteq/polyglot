#!/usr/bin/env bash
# ============================================================================
# rollout-to-clients.sh
# ----------------------------------------------------------------------------
# P4 — Rolls the theme-toolkit/ into each vendored client-repo's toolkit/
# subdirectory, runs a clean install, and executes preflight-repo.mjs to
# prove Phase 1 (P0/P1) + Phase 2 (P2) fixes actually landed live.
#
# Runs UNATTENDED — no prompts. Exit 0 = every client synced + preflight
# green; exit 1 = at least one client failed. Per-client OK/FAIL lines go
# to ./rollout-log.txt in the toolkit repo (this script's cwd on success).
#
# macOS BSD-rsync compat: uses --delete-after (not --del), no --info=stats,
# no --stats=1. Explicit trailing slash on <source>/ for content-copy.
#
# Flags:
#   --dry-run              Print rsync command per client; skip install + preflight.
#   --client <name>        Sync only one client (must be in the list below).
#   --with-taste-deps      After npm ci, also `npm i --prefix toolkit
#                          color-thief chroma-js tesseract.js` (P9 live extraction).
#   --skip-preflight       Sync + install only. Diagnostic — never default.
#
# Usage examples:
#   ./rollout-to-clients.sh
#   ./rollout-to-clients.sh --dry-run
#   ./rollout-to-clients.sh --client penelope --with-taste-deps
# ============================================================================

set -u  # error on undefined vars — deliberately NOT `set -e`, we want to
        # continue past a single client failure and record it in the log.
set -o pipefail

# ---------------------------------------------------------------------------
# 0. Constants — edit the CLIENTS array to add/remove repos.
# ---------------------------------------------------------------------------
readonly SOURCE_DIR="/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/theme-toolkit"
readonly CLIENTS_BASE="/Users/yashbaldha/Desktop/Shopify Task"
readonly LOG_FILE="${SOURCE_DIR}/rollout-log.txt"

CLIENTS=(
  "penelope"
  "bunevida"
  "grafilabel"
  "mex_dynamic"
  "negombo-surf"
  "nuve"
)

# rsync exclude list — kept as an array so `printf '%s\n'` is safe.
RSYNC_EXCLUDES=(
  "node_modules"
  "gate-reports"
  ".git"
  "*.log"
  ".DS_Store"
)

# ---------------------------------------------------------------------------
# 1. Flag parsing.
# ---------------------------------------------------------------------------
DRY_RUN=0
ONLY_CLIENT=""
WITH_TASTE_DEPS=0
SKIP_PREFLIGHT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)          DRY_RUN=1; shift ;;
    --client)           ONLY_CLIENT="${2:-}"; shift 2 ;;
    --with-taste-deps)  WITH_TASTE_DEPS=1; shift ;;
    --skip-preflight)   SKIP_PREFLIGHT=1; shift ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      echo "run with --help for usage." >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 2. Sanity — source must exist; if --client is set, it must be in the list.
# ---------------------------------------------------------------------------
if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "FATAL: source theme-toolkit dir not found: ${SOURCE_DIR}" >&2
  exit 1
fi

if [[ -n "${ONLY_CLIENT}" ]]; then
  found=0
  for c in "${CLIENTS[@]}"; do
    [[ "$c" == "${ONLY_CLIENT}" ]] && found=1 && break
  done
  if [[ $found -eq 0 ]]; then
    echo "FATAL: --client '${ONLY_CLIENT}' is not in the CLIENTS list." >&2
    echo "known clients: ${CLIENTS[*]}" >&2
    exit 1
  fi
  CLIENTS=("${ONLY_CLIENT}")
fi

# ---------------------------------------------------------------------------
# 3. Reset the log for this run (dry-run doesn't touch the log).
# ---------------------------------------------------------------------------
if [[ $DRY_RUN -eq 0 ]]; then
  {
    echo "# rollout-log — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "# source: ${SOURCE_DIR}"
    echo "# clients: ${CLIENTS[*]}"
    echo "# with-taste-deps=${WITH_TASTE_DEPS}  skip-preflight=${SKIP_PREFLIGHT}"
    echo "# ---"
  } > "${LOG_FILE}"
fi

log() {
  # log <status> <client> <message...>
  local status="$1"; shift
  local client="$1"; shift
  local line
  line="$(printf '[%s] %-14s %s' "${status}" "${client}" "$*")"
  echo "${line}"
  if [[ $DRY_RUN -eq 0 ]]; then
    echo "${line}" >> "${LOG_FILE}"
  fi
}

# ---------------------------------------------------------------------------
# 4. Build the rsync exclude flags once.
# ---------------------------------------------------------------------------
build_rsync_excludes() {
  local -a out=()
  local pat
  for pat in "${RSYNC_EXCLUDES[@]}"; do
    out+=(--exclude "${pat}")
  done
  printf '%s\n' "${out[@]}"
}

# ---------------------------------------------------------------------------
# 5. Per-client sync routine.
#    Returns 0 on full success, non-zero on any step failing.
# ---------------------------------------------------------------------------
sync_client() {
  local client="$1"
  local repo_dir="${CLIENTS_BASE}/${client}"
  local target="${repo_dir}/toolkit"

  echo "-> syncing ${client}"

  if [[ ! -d "${repo_dir}" ]]; then
    log "FAIL" "${client}" "repo dir missing: ${repo_dir}"
    return 1
  fi

  # 5a. Ensure target exists.
  if [[ $DRY_RUN -eq 0 ]]; then
    mkdir -p "${target}" || {
      log "FAIL" "${client}" "mkdir ${target} failed"
      return 1
    }
  fi

  # 5b. rsync — content-copy (trailing slash on source), BSD-compat flags.
  local -a excludes
  # shellcheck disable=SC2207
  excludes=($(build_rsync_excludes))
  # NOTE: excludes above is safe — every element is either `--exclude` or a
  #       shell-safe pattern like `node_modules`. Whitelisted content only.

  local -a rsync_cmd=(
    rsync
    -a
    --delete-after
    "${excludes[@]}"
    "${SOURCE_DIR}/"
    "${target}/"
  )

  if [[ $DRY_RUN -eq 1 ]]; then
    log "DRY " "${client}" "$(printf '%q ' "${rsync_cmd[@]}")"
    return 0
  fi

  if ! "${rsync_cmd[@]}"; then
    log "FAIL" "${client}" "rsync failed"
    return 1
  fi

  # 5c. Fresh install — pinned to the vendored toolkit only, never the theme.
  if ! ( cd "${repo_dir}" && npm ci --prefix toolkit ); then
    log "FAIL" "${client}" "npm ci --prefix toolkit failed"
    return 1
  fi

  # 5d. Optional: unlock P9 live taste-extraction deps.
  if [[ $WITH_TASTE_DEPS -eq 1 ]]; then
    if ! ( cd "${repo_dir}" && npm i --prefix toolkit color-thief chroma-js tesseract.js ); then
      log "FAIL" "${client}" "taste-deps install failed"
      return 1
    fi
  fi

  # 5e. Preflight — proves Phase 1 + Phase 2 fixes landed live.
  if [[ $SKIP_PREFLIGHT -eq 1 ]]; then
    log "OK  " "${client}" "sync+install ok (preflight skipped)"
    return 0
  fi

  if ! ( cd "${repo_dir}" && node toolkit/scripts/preflight-repo.mjs ); then
    log "FAIL" "${client}" "preflight-repo.mjs failed — see gate-reports/"
    return 1
  fi

  log "OK  " "${client}" "sync + install + preflight green"
  return 0
}

# ---------------------------------------------------------------------------
# 6. Main loop.
# ---------------------------------------------------------------------------
exit_code=0
ok_count=0
fail_count=0

for client in "${CLIENTS[@]}"; do
  if sync_client "${client}"; then
    ok_count=$((ok_count + 1))
  else
    fail_count=$((fail_count + 1))
    exit_code=1
  fi
done

# ---------------------------------------------------------------------------
# 7. Summary line — always the last thing written to log + stdout.
# ---------------------------------------------------------------------------
summary="rollout done: ${ok_count} ok, ${fail_count} fail (of ${#CLIENTS[@]})"
if [[ $DRY_RUN -eq 1 ]]; then
  summary="DRY RUN — ${summary}"
fi

echo "---"
echo "${summary}"
if [[ $DRY_RUN -eq 0 ]]; then
  echo "---" >> "${LOG_FILE}"
  echo "${summary}" >> "${LOG_FILE}"
  echo "log: ${LOG_FILE}"
fi

# If a permissions gate stripped +x from this file, remind Yash how to fix it.
if [[ ! -x "$0" ]]; then
  echo "reminder: chmod +x ${0}"
fi

exit "${exit_code}"
