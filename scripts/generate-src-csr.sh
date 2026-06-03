#!/bin/bash

set -e

TIN="$1"
STOREPASS="$2"

if [ -z "$TIN" ]; then
  echo "Usage: ./scripts/generate-src-csr.sh <TIN> <PASSWORD>"
  exit 1
fi

if [ -z "$STOREPASS" ]; then
  echo "Usage: ./scripts/generate-src-csr.sh <TIN> <PASSWORD>"
  exit 1
fi

OUT_DIR="src-certificates/$TIN"
JKS_FILE="$OUT_DIR/$TIN.jks"
CSR_FILE="$OUT_DIR/$TIN.csr"

mkdir -p "$OUT_DIR"

echo "Generating JKS for TIN: $TIN"

keytool -genkeypair \
  -v \
  -keyalg RSA \
  -alias "$TIN" \
  -keysize 2048 \
  -validity 3650 \
  -dname "CN=$TIN Tin, OU=$TIN Tin, O=$TIN Tin, L=Yerevan, ST=Yerevan, C=AM" \
  -keystore "$JKS_FILE" \
  -keypass "$STOREPASS" \
  -storepass "$STOREPASS"

echo "Generating CSR..."

keytool -certreq \
  -alias "$TIN" \
  -keyalg RSA \
  -keystore "$JKS_FILE" \
  -storepass "$STOREPASS" \
  -file "$CSR_FILE"

echo "Done."
echo "JKS: $JKS_FILE"
echo "CSR: $CSR_FILE"
echo ""
echo "Next step: upload CSR file to file-online.taxservice.am in U6 application."