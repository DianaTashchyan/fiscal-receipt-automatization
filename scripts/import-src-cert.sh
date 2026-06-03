#!/bin/bash

set -e

TIN="$1"
STOREPASS="$2"
SRC_CRT_FILE="$3"
CA_ROOT_FILE="$4"

if [ -z "$TIN" ]; then
  echo "Usage: ./scripts/import-src-cert.sh <TIN> <PASSWORD> <SRC_CRT_FILE> <CA_ROOT_FILE>"
  exit 1
fi

if [ -z "$STOREPASS" ]; then
  echo "Usage: ./scripts/import-src-cert.sh <TIN> <PASSWORD> <SRC_CRT_FILE> <CA_ROOT_FILE>"
  exit 1
fi

if [ -z "$SRC_CRT_FILE" ]; then
  echo "Usage: ./scripts/import-src-cert.sh <TIN> <PASSWORD> <SRC_CRT_FILE> <CA_ROOT_FILE>"
  exit 1
fi

if [ -z "$CA_ROOT_FILE" ]; then
  echo "Usage: ./scripts/import-src-cert.sh <TIN> <PASSWORD> <SRC_CRT_FILE> <CA_ROOT_FILE>"
  exit 1
fi

JKS_FILE="src-certificates/$TIN/$TIN.jks"

if [ ! -f "$JKS_FILE" ]; then
  echo "JKS file not found: $JKS_FILE"
  exit 1
fi

if [ ! -f "$SRC_CRT_FILE" ]; then
  echo "SRC CRT file not found: $SRC_CRT_FILE"
  exit 1
fi

if [ ! -f "$CA_ROOT_FILE" ]; then
  echo "CA root file not found: $CA_ROOT_FILE"
  exit 1
fi

echo "Importing SRC CA root certificate..."

keytool -importcert \
  -trustcacerts \
  -noprompt \
  -alias ca-root \
  -keystore "$JKS_FILE" \
  -storepass "$STOREPASS" \
  -file "$CA_ROOT_FILE"

echo "Importing SRC signed certificate..."

keytool -importcert \
  -trustcacerts \
  -noprompt \
  -alias "$TIN" \
  -keystore "$JKS_FILE" \
  -storepass "$STOREPASS" \
  -file "$SRC_CRT_FILE"

echo "Done."
echo "Updated JKS: $JKS_FILE"
echo ""
echo "Keystore content:"
keytool -list \
  -keystore "$JKS_FILE" \
  -storepass "$STOREPASS"