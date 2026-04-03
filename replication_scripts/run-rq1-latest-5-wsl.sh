set -euo pipefail

run_name="${1:-gpt4omini_latest5}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
testpilot_dir="$repo_root/testpilot"
runner="$testpilot_dir/benchmark/run.js"

packages_dir="$repo_root/outputs/packages_latest"
runs_dir="$repo_root/outputs/runs/$run_name"
skip_completed="${SKIP_COMPLETED:-1}"
time_limit_seconds="${TIME_LIMIT_SECONDS:-18000}"
temperatures="${TEMPERATURES:-0.0}"
num_completions="${NUM_COMPLETIONS:-5}"
snippets="${SNIPPETS:-doc}"
num_snippets="${NUM_SNIPPETS:-all}"
snippet_length="${SNIPPET_LENGTH:-20}"

mkdir -p "$packages_dir" "$runs_dir"

if [[ ! -f "$runner" ]]; then
  echo "Missing: $runner (build testpilot first)" >&2
  exit 1
fi

latest_pkgs=(
  "image-downloader"
  "crawler-url-parser"
  "countries-and-timezones"
  "plural"
  "jsonfile"
)

for pkg in "${latest_pkgs[@]}"; do
  out_dir="$runs_dir/$pkg"
  if [[ "$skip_completed" == "1" && -f "$out_dir/report.json" ]]; then
    echo "Skipping already completed: $pkg"
    continue
  fi

  version="$(npm view "$pkg" version)"
  echo "Latest $pkg = $version"

  pkg_dir="$packages_dir/$pkg"
  rm -rf "$pkg_dir"
  mkdir -p "$pkg_dir"

  echo "Downloading tarball for $pkg@$version"
  tarball="$(cd "$pkg_dir" && npm pack "$pkg@$version" | tail -n 1)"

  echo "Extracting $tarball"
  ( cd "$pkg_dir" && tar -xzf "$tarball" )

  src_dir="$pkg_dir/package"
  if [[ ! -f "$src_dir/package.json" ]]; then
    echo "Expected extracted package.json at $src_dir/package.json" >&2
    exit 1
  fi

  echo "Installing deps for $pkg@$version"
  ( cd "$src_dir" && npm install )

  # If package has a build script AND main entrypoint is missing, run build, as some packages might need it.
  if ( cd "$src_dir" && node -e "
    try {
      const fs = require('fs');
      const path = require('path');
      const p = require('./package.json');
      if (!p?.scripts?.build) process.exit(1);
      const main = p.main || 'index.js';
      process.exit(fs.existsSync(path.join(process.cwd(), main)) ? 1 : 0);
    } catch { process.exit(1); }
  " ); then
    echo "Running build for $pkg@$version"
    ( cd "$src_dir" && npm run build )
  fi

  mkdir -p "$out_dir"
  echo "Running TestPilot for latest $pkg@$version"
  ( cd "$testpilot_dir" && node "$runner" \
      --outputDir "$out_dir" \
      --package "$src_dir" \
      --snippets "$snippets" \
      --numSnippets "$num_snippets" \
      --snippetLength "$snippet_length" \
      --temperatures "$temperatures" \
      --numCompletions "$num_completions" \
      --model gpt \
      --timeLimit "$time_limit_seconds" )
done

echo "Done. Outputs in: $runs_dir"

