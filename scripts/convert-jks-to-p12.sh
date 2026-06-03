#!/bin/bash
#
# convert-jks-to-p12.sh
# ---------------------------------------------------------------------------
# Node's TLS stack cannot read Java .jks keystores. After you have run
# generate-src-csr.sh and import-src-cert.sh (so the .jks holds your private
# key + the SRC-signed cert + the CA root), convert it ONCE to PKCS#12 (.p12),
# which is what the real SRC client (SRC_CERT_PATH) loads.
#
# Usage:
#   ./scripts/convert-jks-to-p12.sh <TIN> <JKS_STOREPASS> <P12_PASSWORD>
#
set -e

TIN="$1"
JKS_STOREPASS="$2"
P12_PASSWORD="$3"

if [ -z "$TIN" ] || [ -z "$JKS_STOREPASS" ] || [ -z "$P12_PASSWORD" ]; then
  echo "Usage: ./scripts/convert-jks-to-p12.sh <TIN> <JKS_STOREPASS> <P12_PASSWORD>"
  exit 1
fi

JKS_FILE="src-certificates/$TIN/$TIN.jks"
P12_FILE="src-certificates/$TIN/$TIN.p12"

if [ ! -f "$JKS_FILE" ]; then
  echo "JKS file not found: $JKS_FILE"
  echo "Run generate-src-csr.sh and import-src-cert.sh first."
  exit 1
fi

echo "Converting $JKS_FILE -> $P12_FILE"

keytool -importkeystore \
  -srckeystore "$JKS_FILE" \
  -srcstoretype JKS \
  -srcstorepass "$JKS_STOREPASS" \
  -destkeystore "$P12_FILE" \
  -deststoretype PKCS12 \
  -deststorepass "$P12_PASSWORD"

echo "Done."
echo "PKCS#12: $P12_FILE"
echo ""
echo "Set these env vars for real mode:"
echo "  SRC_CERT_PATH=$P12_FILE"
echo "  SRC_CERT_PASSWORD=$P12_PASSWORD"
