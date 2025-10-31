#!/usr/bin/env bash
set -e

if [[ -n $VERSION ]]; then
	CODE_SERVER_INSTALL_ARGS="$CODE_SERVER_INSTALL_ARGS --version=\"$$VERSION\""
fi

# TODO: update package name when available
npm install -g @anthropic/claude-code-cli@$VERSION
