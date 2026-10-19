#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -sm)" != 'Linux x86_64' ]]; then
  echo 'Repository checks require Linux x86_64 (also supported through WSL).' >&2
  exit 1
fi
if [[ "$(git rev-parse --is-shallow-repository)" != false ]]; then
  echo 'Secret scanning requires full Git history. Fetch the full history first.' >&2
  exit 1
fi

tool_dir="$PWD/.cache/ci"
mkdir -p "$tool_dir"

# Verify pinned release archives before extracting or executing their binaries.
install_tool() {
  local repository="$1" version="$2" archive="$3" checksum="$4" member="$5"
  local archive_path="$tool_dir/$archive" binary="${member##*/}"
  if [[ ! -f "$archive_path" ]]; then
    curl --fail --silent --show-error --location --retry 3 --proto '=https' \
      "https://github.com/$repository/releases/download/$version/$archive" \
      --output "$archive_path"
  fi
  printf '%s  %s\n' "$checksum" "$archive_path" | sha256sum --check --status
  tar -xOf "$archive_path" "$member" > "$tool_dir/$binary"
  chmod 700 "$tool_dir/$binary"
}

install_tool rhysd/actionlint v1.7.12 actionlint_1.7.12_linux_amd64.tar.gz \
  8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 actionlint
install_tool koalaman/shellcheck v0.11.0 shellcheck-v0.11.0.linux.x86_64.tar.gz \
  b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 shellcheck-v0.11.0/shellcheck
install_tool gitleaks/gitleaks v8.30.1 gitleaks_8.30.1_linux_x64.tar.gz \
  551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb gitleaks

export PATH="$tool_dir:$PATH"
actionlint -version
shellcheck --version
gitleaks version
shellcheck $PWD/scripts/*.sh
actionlint
gitleaks git --redact --no-banner --log-opts='--all --full-history' .
