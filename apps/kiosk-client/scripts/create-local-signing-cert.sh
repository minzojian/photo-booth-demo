#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${SIGN_OUT_DIR:-$APP_DIR/.local-signing}"
CERT_NAME="${CERT_NAME:-PhotoBooth Local Code Signing}"
DAYS="${CERT_DAYS:-3650}"
P12_PASS="${P12_PASS:-pbk-local-sign}"
KEYCHAIN="${SIGN_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"

mkdir -p "$OUT_DIR"
KEY_FILE="$OUT_DIR/local-codesign.key"
CRT_FILE="$OUT_DIR/local-codesign.crt"
P12_FILE="$OUT_DIR/local-codesign.p12"

if security find-identity -v -p codesigning | grep -F "$CERT_NAME" >/dev/null 2>&1; then
  echo "[sign] identity already exists: $CERT_NAME"
  security find-identity -v -p codesigning | grep -F "$CERT_NAME" || true
  exit 0
fi

echo "[sign] generating self-signed certificate: $CERT_NAME"
openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
  -keyout "$KEY_FILE" \
  -out "$CRT_FILE" \
  -subj "/CN=$CERT_NAME" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=codeSigning"

openssl pkcs12 -export \
  -legacy \
  -inkey "$KEY_FILE" \
  -in "$CRT_FILE" \
  -name "$CERT_NAME" \
  -passout "pass:$P12_PASS" \
  -out "$P12_FILE"

echo "[sign] importing certificate into: $KEYCHAIN"
security import "$P12_FILE" -k "$KEYCHAIN" -P "$P12_PASS" -A -T /usr/bin/codesign -T /usr/bin/security

# Mark cert trusted in login keychain for local testing.
security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN" "$CRT_FILE" || true

echo "[sign] done. verify identities:"
security find-identity -v -p codesigning | grep -F "$CERT_NAME" || true
