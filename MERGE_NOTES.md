# SRC / taxservice integration merge — handoff

Your Next.js project is the base. The correct SRC integration logic from the
boss project (mutual-TLS auth, persistent `seq`, all 8 methods, SRC error
mapping) has been ported into it in TypeScript. Your frontend, Prisma schema,
receipt history, PDF/QR generation, and Render compatibility are preserved.

The 31-test logic suite passes (`npm run test:src`). The pure SRC modules
type-check cleanly. The DB-dependent pieces follow the same patterns but could
not be executed here because Prisma needs to download an engine and the install
is platform-specific — run the commands below in your own environment.

---

## 1. Exact changed / added files

**Prisma**
- `prisma/schema.prisma` — added `SrcSequence` model (persistent per-CRN seq) and
  SRC response columns on `Receipt`: `srcReceiptId, srcSn, srcTin, srcTaxpayer,
  srcAddress, srcFiscalTime, srcTotal, srcChange, srcRawResponse, srcMode`.
  `tableNumber` column kept (no longer shown).

**SRC service layer — `src/lib/src/`** (clean separation, no SRC logic in React)
- `types.ts` *(new)* — shared types + constants (`TAX_REGIME`, `MODE`,
  `DISCOUNT_TYPE`, `ADDITIONAL_DISCOUNT_TYPE`), `ISrcClient` interface.
- `errors.ts` *(new)* — `SrcError` (mirrors SRC code/message), `SrcConfigError`,
  `SrcValidationError`.
- `config.ts` *(rewritten)* — mode resolution (`TAX_API_MODE`/`SRC_MODE`),
  base URLs, and `getRealCertConfig()` that throws the exact messages
  (“SRC certificate is missing”, “SRC_CRN is not set”, “SRC_TIN is invalid”, …).
- `validation.ts` *(new)* — TIN(8-digit)/CRN/regime(1,2,3,7)/mode(2,3) checks,
  `money()` (2dp, half-up: 0.005→0.01), `quantity()` (3dp), field length limits
  (goodName/goodCode/unit ≤50, non-empty), partnerTin null-or-8-digit, totals.
- `mapper.ts` *(new)* — maps local receipt → SRC `print` payload, and SRC result
  → the `Receipt` columns.
- `sequence.ts` *(new)* — persistent, concurrency-safe `nextSeq(crn)` via an
  atomic Postgres upsert-increment; `peekSeq`, `setSeq`.
- `mock-client.ts` *(new)* — full mock client (manual-shaped responses, no certs).
- `real-client.ts` *(new)* — real mTLS client over PKCS#12; all 8 methods.
- `client.ts` *(rewritten)* — factory that picks mock/real by env and injects the
  next `seq` for seq-bearing methods.

**Fiscal service**
- `src/lib/services/tax-api.service.ts` *(rewritten)* — validates locally, maps,
  calls the client, returns all SRC fields + the active mode.

**API endpoints — `src/app/api/src/`**
- `check-connection/route.ts`, `activate/route.ts`, `configure-departments/route.ts`,
  `get-good-list/route.ts`, `print/route.ts` *(existing — now use the new client)*
- `print-copy/route.ts` *(new)*
- `get-returned-receipt-info/route.ts` *(new)*
- `print-return-receipt/route.ts` *(new)*
- `validate-company/route.ts` *(new — readiness checklist)*

**Receipt fiscalization routes (persist full SRC fields + mode, pass restaurant CRN)**
- `src/app/api/receipts/route.ts`
- `src/app/api/receipts/manual/route.ts`
- `src/app/api/receipts/[id]/retry-fiscalization/route.ts`

**`tableNumber` removed from UI (DB column kept)**
- `src/app/receipts/new/receipt-create-form.tsx`
- `src/app/receipts/[id]/page.tsx` (also shows SRC SN / mode when present)
- `src/app/api/receipts/[id]/pdf/route.ts` (uses real `srcSn`/`srcMode`)

**Scripts / config**
- `scripts/test-src.ts` *(new)* — 31 logic tests.
- `scripts/convert-jks-to-p12.sh` *(new)* — JKS→PKCS#12 (Node can’t read .jks).
- `package.json` — added `"test:src"`.
- `.gitignore` *(new)* — ignores `src-certificates/`, `*.jks/csr/crt/p12/pfx/pem/key`.
- `.env.example` *(new)* — all SRC env vars documented.
- `src-certificates/README.md` *(new)*.

---

## 2. Exact terminal commands

```bash
# 0. (one-time) the old test certs are tracked in git — stop tracking them
git rm -r --cached src-certificates 2>/dev/null || true

# 1. install (no new runtime deps were required; this just refreshes the lockfile)
npm install

# 2. apply the schema changes (SrcSequence + new Receipt columns)
npx prisma generate
npx prisma db push

# 3. run the SRC logic tests (no DB needed)
npm run test:src

# 4. build
npm run build

# 5. commit & push
git add .
git commit -m "Merge correct SRC/taxservice integration (mTLS, seq, 8 methods) into app"
git push
```

> Your `package.json` `build` script already runs `prisma generate && prisma db
> push && db:seed && next build`, so Render will apply the schema on deploy.

---

## 3. What works in MOCK mode (`TAX_API_MODE=mock`)

Everything end-to-end, with **no certificates and no real env**:
- Create a receipt in the UI → validated → mapped to the SRC `print` payload →
  mock client returns a manual-shaped result (`receiptId, fiscal, sn, tin,
  taxpayer, address, time, total, change, qr`).
- Receipt is saved as `FISCALIZED` with all `src*` fields, `srcMode="mock"`.
- PDF + QR render from the stored response. History/detail pages work.
- All 9 `/api/src/*` endpoints respond.
- `seq` is still pulled from the persistent `SrcSequence` table, so the
  increment behavior is identical to real mode.

## 4. What works in REAL mode (`TAX_API_MODE=src_real`) once you add company data

Once a company’s real TIN/CRN/certificate are configured:
- The real client opens a **mutual-TLS** connection using the company’s PKCS#12
  bundle (the certificate *is* the credential — there is no API key/token).
- `print` (and the other methods) hit `https://ecrm.taxservice.am/taxsystem-rs-vcr`,
  with the `crn`, the next `seq`, the `language` header, and the validated payload.
- The **real fiscal number** from SRC is stored; nothing is faked. If SRC returns
  a non-zero code (e.g. 104 INVALID_SEQ, 403 UNAUTHORIZED_CONNECTION), the receipt
  is marked `FAILED` and the error response is saved.
- Missing/invalid config fails fast with clear messages before any network call.

Switch a deployment to real mode by setting `TAX_API_MODE=src_real` plus the
company env/certs below.

---

## 5. Data you still need from the company / SRC cabinet

For each company (tenant) you fiscalize on behalf of:

1. **TIN (ՀՎՀՀ)** — 8 digits → `SRC_TIN` (and the `Restaurant.tin`).
2. **CRN (ՀԴՄ-ի գրանցման համար)** — from the ECR list page → `SRC_CRN`
   (and `Restaurant.crn`).
3. **Cashier id** — the cashier number registered on the ECR → `SRC_CASHIER_ID`
   (and `Cashier.taxCashierId`).
4. **Departments + tax regimes** — configured in the cabinet and via
   `configureDepartments` (regime 1/2/3/7) → your `Department` rows.
5. **The registered outbound IP** — section 5.2 of the u6 application **must** be
   your Render server’s static outbound IP, or every call returns
   `403 UNAUTHORIZED_CONNECTION`.
6. **Certificate chain**, produced with the included scripts + the manual:
   - `generate-src-csr.sh <TIN> <pass>` → `.jks` + `.csr`
   - upload the `.csr` in the u6 application; after approval download the `.crt`
     and the SRC **CA root** from src.am
   - `import-src-cert.sh <TIN> <pass> <crt> <ca_root>` → imports both into the `.jks`
   - `convert-jks-to-p12.sh <TIN> <jksPass> <p12Pass>` → `.p12` for Node
   - set `SRC_CERT_PATH` (→ the `.p12`), `SRC_CERT_PASSWORD`, optionally
     `SRC_CA_CERT_PATH`.

On Render, store the `.p12` as a **Secret File** (not in git) and point
`SRC_CERT_PATH` at its mount path.

---

## 6. Important caveats / honesty

- **No real taxservice connection is claimed.** Real mode is fully wired but
  inert until you supply a real TIN/CRN and a valid `.p12` whose CSR was approved
  by SRC against your registered IP.
- The **test endpoint** (`https://10.3.14.123:447`) is an internal SRC address,
  reachable only inside SRC’s network — you cannot reach it from Render.
- I could not run `prisma db push` or `next build` in this environment (no
  database; Prisma engine download blocked; the provided `node_modules` was built
  for macOS). The SRC logic itself is verified by the passing test suite and a
  clean type-check of the new modules. Run the commands in section 2 to confirm
  the full build on your machine / Render.
- The `seq` increment is safe for concurrent requests because it’s a single
  atomic SQL `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so two requests can
  never receive the same value.
