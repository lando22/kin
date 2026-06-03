#!/bin/sh
# shellcheck shell=sh
#
# Kin installer — https://github.com/lando22/kin
#
#   curl -fsSL https://lando22.github.io/kin/install.sh | sh
#
# Downloads a prebuilt `kin` binary for your platform from GitHub Releases
# (no Node.js required).
#
# Environment overrides:
#   KIN_INSTALL_REPO    GitHub repo that hosts the release binaries
#                       (default: lando22/kin)
#
# NOTE: For the binary path to work, that repo must be PUBLIC and have a
# GitHub Release with assets named kin-<os>-<arch>.tar.gz (the build-binaries
# workflow produces these on tag push).
#   KIN_INSTALL_VERSION Tag to install, e.g. v0.75.3 (default: latest)
#   KIN_INSTALL_DIR     Where program files go (default: ~/.local/share/kin)
#   KIN_INSTALL_BIN     Where the `kin` symlink goes (default: ~/.local/bin)
#
set -eu

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
REPO="${KIN_INSTALL_REPO:-lando22/kin}"
VERSION="${KIN_INSTALL_VERSION:-latest}"
INSTALL_DIR="${KIN_INSTALL_DIR:-$HOME/.local/share/kin}"
BIN_DIR="${KIN_INSTALL_BIN:-$HOME/.local/bin}"

# ----------------------------------------------------------------------------
# Pretty output
# ----------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	BOLD="$(printf '\033[1m')"
	DIM="$(printf '\033[2m')"
	RESET="$(printf '\033[0m')"
	MAGENTA="$(printf '\033[35m')"
	CYAN="$(printf '\033[36m')"
	GREEN="$(printf '\033[32m')"
	YELLOW="$(printf '\033[33m')"
	RED="$(printf '\033[31m')"
else
	BOLD="" DIM="" RESET="" MAGENTA="" CYAN="" GREEN="" YELLOW="" RED=""
fi

banner() {
	printf '\n'
	printf '%s' "$MAGENTA"
	printf '   ██╗  ██╗██╗███╗   ██╗\n'
	printf '   ██║ ██╔╝██║████╗  ██║\n'
	printf '   █████╔╝ ██║██╔██╗ ██║\n'
	printf '   ██╔═██╗ ██║██║╚██╗██║\n'
	printf '   ██║  ██╗██║██║ ╚████║\n'
	printf '   ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝\n'
	printf '%s' "$RESET"
	printf '   %sa minimal terminal coding agent%s  %s· github.com/lando22/kin%s\n\n' "$DIM" "$RESET" "$CYAN" "$RESET"
}

step()  { printf '%s==>%s %s\n' "$CYAN$BOLD" "$RESET" "$1"; }
info()  { printf '    %s%s%s\n' "$DIM" "$1" "$RESET"; }
ok()    { printf '%s  ✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '%s  !%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '%s  ✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

# Download $1 to stdout (used for the version lookup) or to file $2.
download() {
	url="$1"; out="${2:-}"
	if have curl; then
		if [ -n "$out" ]; then
			curl -fsSL --proto '=https' "$url" -o "$out" 2>/dev/null
		else
			curl -fsSL --proto '=https' "$url" 2>/dev/null
		fi
	elif have wget; then
		if [ -n "$out" ]; then
			wget -qO "$out" "$url" 2>/dev/null
		else
			wget -qO- "$url" 2>/dev/null
		fi
	else
		die "Need either curl or wget to download Kin."
	fi
}

detect_platform() {
	os="$(uname -s)"
	arch="$(uname -m)"
	case "$os" in
		Darwin) os="darwin" ;;
		Linux)  os="linux" ;;
		*)      return 1 ;;
	esac
	case "$arch" in
		x86_64|amd64)  arch="x64" ;;
		arm64|aarch64) arch="arm64" ;;
		*)             return 1 ;;
	esac
	printf '%s-%s' "$os" "$arch"
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
banner

platform="$(detect_platform)" || {
	warn "Unsupported platform: $(uname -s)/$(uname -m)."
	die "No prebuilt Kin binary is available for this platform."
}
ok "Detected platform: ${BOLD}${platform}${RESET}"

asset="kin-${platform}.tar.gz"
if [ "$VERSION" = "latest" ]; then
	url="https://github.com/${REPO}/releases/latest/download/${asset}"
else
	url="https://github.com/${REPO}/releases/download/${VERSION}/${asset}"
fi

have tar || die "tar is required but was not found."

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t kin)"
trap 'rm -rf "$tmp"' EXIT INT TERM

step "Downloading Kin (${VERSION})"
info "$url"
if ! download "$url" "$tmp/$asset"; then
	die "Could not download $asset. The GitHub release or asset may not exist yet:
       $url"
fi
ok "Downloaded $asset"

step "Installing"
tar -xzf "$tmp/$asset" -C "$tmp" || die "Failed to extract $asset."
# Archives wrap everything in a top-level kin/ directory.
src="$tmp/kin"
[ -d "$src" ] || src="$tmp"
[ -f "$src/kin" ] || die "Archive did not contain a kin binary."

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "$src/." "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/kin"
info "Program files: $INSTALL_DIR"

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/kin" "$BIN_DIR/kin"
ok "Linked ${BOLD}${BIN_DIR}/kin${RESET}"

installed_version="$("$INSTALL_DIR/kin" --version 2>/dev/null || true)"
[ -n "$installed_version" ] && ok "Kin $installed_version"

# ----------------------------------------------------------------------------
# PATH guidance
# ----------------------------------------------------------------------------
case ":${PATH}:" in
	*":${BIN_DIR}:"*)
		on_path=1 ;;
	*)
		on_path=0 ;;
esac

printf '\n%s%sKin is installed!%s\n\n' "$BOLD" "$GREEN" "$RESET"
if [ "$on_path" -eq 1 ]; then
	printf '  Run %skin%s in any project to get started.\n\n' "$CYAN$BOLD" "$RESET"
else
	case "${SHELL##*/}" in
		zsh)  rc="~/.zshrc" ;;
		bash) rc="~/.bashrc" ;;
		fish) rc="~/.config/fish/config.fish" ;;
		*)    rc="your shell profile" ;;
	esac
	warn "${BIN_DIR} is not on your PATH yet."
	printf '  Add it by appending this line to %s%s%s:\n\n' "$BOLD" "$rc" "$RESET"
	if [ "${SHELL##*/}" = "fish" ]; then
		printf '      %sfish_add_path %s%s\n\n' "$DIM" "$BIN_DIR" "$RESET"
	else
		printf '      %sexport PATH="%s:$PATH"%s\n\n' "$DIM" "$BIN_DIR" "$RESET"
	fi
	printf '  Then restart your shell and run %skin%s.\n\n' "$CYAN$BOLD" "$RESET"
fi
printf '  Docs: %shttps://github.com/lando22/kin#readme%s\n\n' "$DIM" "$RESET"
