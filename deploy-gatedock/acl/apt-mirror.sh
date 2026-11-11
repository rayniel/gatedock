#!/bin/sh
set -eu

mirror="${1%/}"
if ! printf '%s\n' "$mirror" | grep -Eq '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?(/[A-Za-z0-9._-]+)*$'; then
    echo "Invalid Debian mirror: expected an HTTPS origin or path without credentials" >&2
    exit 1
fi

sources=/etc/apt/sources.list.d/debian.sources
if [ "$(grep -c '^URIs: http://deb.debian.org/' "$sources")" -ne 2 ]; then
    echo "Unexpected Debian base-image sources; refusing to replace them" >&2
    exit 1
fi
sed -i "s|^URIs: http://deb.debian.org/|URIs: $mirror/|" "$sources"
echo "Using Debian mirror: $mirror"
