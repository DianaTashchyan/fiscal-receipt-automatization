# Electronic Fiscal Receipt Service

Production-ready backend for generating **Armenian SRC (State Revenue Committee) compliant electronic fiscal receipts** for restaurants and retail.

The service creates receipts, fiscalizes them through the real SRC taxservice web API over mutual TLS, generates PDF receipts with verified QR codes, and delivers them to customers by email.

---

## What a company needs to provide

| Item | Where to get it |
|------|----------------|
| **TIN** (8-digit ՀVՀՀ) | SRC cabinet → company profile |
| **CRN** (ՀԴՄ number) | SRC u6 application → ECR registration |
| **.p12 certificate** | Convert from .jks with `scripts/convert-jks-to-p12.sh` |
| **Certificate password** | Chosen when running `keytool -importkeystore` |
| **Server static IP** | Register with SRC (u6 → IP address section 5.2) |

Everything else is implemented and ready.

---

## Technology Stack

- **Next.js 16** (App Router, Server Components)
- **TypeScript** (strict mode, zero errors)
- **Prisma 6** + **PostgreSQL**
- **pdf-lib** + **qrcode** — PDF receipt generation
- **nodemailer** — real SMTP email delivery
- **jose** — JWT authentication
- **bcryptjs** — password hashing
- **zod** — validation

---

## Environment Setup

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

### Minimum for mock mode (development/demo)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/fiscal_receipt?schema=public"
JWT_SECRET="your-secret-here"
TAX_API_MODE=mock
```

### Minimum for real SRC fiscalization (production)

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="<32+ random chars>"
TAX_API_MODE=src_real

SRC_TIN=<8-digit TIN>
SRC_CRN=<cash register number>
SRC_CERT_PATH=src-certificates/<TIN>/<TIN>.p12
SRC_CERT_PASSWORD=<p12 password>

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=<smtp password>
SMTP_FROM="Company Name <noreply@example.com>"
```

---

## Installation

```bash
npm install
npm run db:setup      # run migrations + seed demo data
npm run dev           # start development server
```

For production:

```bash
npm run db:migrate    # apply migrations only (no seed)
npm run build
npm start
```

---

## SRC Setup Sequence (first deployment)

Run these once after deploying with real credentials:

```bash
# 1. Test that your certificate and CRN work
POST /api/src/check-connection   { "crn": "<CRN>" }

# 2. Activate the ECR (must be done before any receipts)
POST /api/src/activate            { "crn": "<CRN>" }

# 3. Configure tax departments (match your departments in SRC cabinet)
POST /api/src/configure-departments
{ "crn": "<CRN>", "departments": [{ "dep": 1, "taxRegime": 1 }] }

# 4. Create your restaurant via API
POST /api/restaurants
Authorization: Bearer <jwt>
{ "name": "...", "tin": "<TIN>", "crn": "<CRN>", "address": "..." }

# 5. Add a cashier (taxCashierId from SRC cabinet)
POST /api/restaurants/<id>/cashiers
{ "name": "...", "taxCashierId": "3", "pinCode": "1234", "isDefault": true }

# 6. Add a department
POST /api/restaurants/<id>/departments
{ "name": "Main Hall", "taxDepartmentId": "1", "taxRegime": 1, "isDefault": true }

# 7. Add products (goodCode from SRC good list)
POST /api/restaurants/<id>/products
{ "departmentId": "...", "name": "...", "goodCode": "2106-90", "adgCode": "2106",
  "unit": "piece", "price": 3500 }

# 8. Create an API key for the POS system
POST /api/restaurants/<id>/api-keys
{ "label": "POS Terminal 1" }
```

---

## API Reference

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@fiscal.am", "password": "admin123" }
```

Returns `{ token, user }`. Pass the token as `Authorization: Bearer <token>`.

### Receipts (POS integration)

```http
POST /api/receipts
X-Api-Key: frk_<restaurant-api-key>
Content-Type: application/json

{
  "externalOrderId": "order-001",
  "tableNumber": "12",
  "billAmount": 5000,
  "tipAmount": 500,
  "totalAmount": 5500,
  "paymentMethod": "CARD",
  "deliveryMethod": "EMAIL",
  "customerEmail": "customer@example.com",
  "items": [
    {
      "externalProductId": "ext-prod-001",
      "quantity": 1,
      "unitPrice": 3500,
      "totalPrice": 3500
    }
  ]
}
```

**Returns:** The fiscalized receipt with `fiscalNumber`, `receiptNumber`, `qrData`, and all SRC response fields.

**Idempotent:** sending the same `externalOrderId` twice returns the existing receipt.

### Management API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/restaurants` | List accessible restaurants |
| POST | `/api/restaurants` | Create restaurant |
| GET | `/api/restaurants/:id` | Get restaurant details |
| PATCH | `/api/restaurants/:id` | Update TIN, CRN, name, address |
| GET | `/api/restaurants/:id/cashiers` | List cashiers |
| POST | `/api/restaurants/:id/cashiers` | Create cashier |
| GET | `/api/restaurants/:id/departments` | List departments |
| POST | `/api/restaurants/:id/departments` | Create department |
| GET | `/api/restaurants/:id/products` | List products |
| POST | `/api/restaurants/:id/products` | Create product |
| GET | `/api/restaurants/:id/api-keys` | List API keys |
| POST | `/api/restaurants/:id/api-keys` | Create API key |
| DELETE | `/api/restaurants/:id/api-keys` | Revoke API key |
| GET | `/api/restaurants/:id/src-config` | Cert status (source, configuredAt — never returns bytes) |
| POST | `/api/restaurants/:id/src-config` | Upload cert (`certBase64` or `certPath`) + password |
| DELETE | `/api/restaurants/:id/src-config` | Remove restaurant cert (falls back to global env) |

### SRC Direct Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/src/check-connection` | Test mTLS connection |
| POST | `/api/src/activate` | Activate ECR (once) |
| POST | `/api/src/configure-departments` | Configure tax departments |
| POST | `/api/src/get-good-list` | Fetch SRC product catalog |
| POST | `/api/src/print` | Print receipt directly |
| POST | `/api/src/print-copy` | Print receipt copy |
| POST | `/api/src/get-returned-receipt-info` | Get receipt for return |
| POST | `/api/src/print-return-receipt` | Issue return receipt |
| GET | `/api/src/sequence` | Inspect seq counter |
| POST | `/api/src/sequence` | Override seq counter (migration) |
| POST | `/api/src/validate-company` | Full readiness checklist |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (DB + SRC config) |
| GET | `/api/receipts/:id/pdf` | Download PDF receipt |
| POST | `/api/receipts/:id/send-email` | Send PDF by email |
| POST | `/api/receipts/:id/retry-fiscalization` | Retry failed receipt |

---

## Database Schema

| Model | Purpose |
|-------|---------|
| `User` | Admin/manager accounts |
| `Restaurant` | Company unit (holds TIN + CRN) |
| `Cashier` | Cashier (taxCashierId from SRC) |
| `Department` | Tax department (taxDepartmentId + taxRegime) |
| `Product` | SKU (goodCode + adgCode from SRC) |
| `Receipt` | Fiscal receipt with full SRC response fields |
| `ReceiptItem` | Individual line items |
| `ReceiptEvent` | Audit trail for every status change |
| `RestaurantApiKey` | Hashed API keys for POS systems |
| `SrcSequence` | Persistent, atomic `seq` counter per CRN |

---

## Certificate Setup

### Step 1 — Convert the SRC-issued keystore to PKCS#12

The SRC registration process produces a Java keystore (`.jks`). Node's TLS stack cannot read `.jks` — convert once:

```bash
# Generate CSR and create keystore (run ONCE before SRC registration)
./scripts/generate-src-csr.sh <TIN>

# After SRC signs the certificate, import it
./scripts/import-src-cert.sh <TIN>

# Convert to PKCS#12 for Node
./scripts/convert-jks-to-p12.sh <TIN> <jks-password> <p12-password>
```

### Step 2 — Store the certificate per restaurant (recommended)

Upload the PKCS#12 bytes directly to the restaurant's record so each company carries its own cert independent of server env:

```bash
# Encode the .p12 file to base64
CERT_B64=$(base64 -i src-certificates/<TIN>/<TIN>.p12)

# Upload via the management API
curl -X POST https://<host>/api/restaurants/<restaurantId>/src-config \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d "{\"certBase64\": \"$CERT_B64\", \"certPassword\": \"<p12-password>\"}"
```

The endpoint validates the cert (wrong password → 422) and stores it AES-256-GCM encrypted in the DB using `CERT_ENCRYPTION_KEY`.

### Alternative — Global env cert (single-company deployments)

Set these env vars to use one cert for all restaurants (falls back when no restaurant cert is stored):

```env
SRC_CERT_PATH=src-certificates/<TIN>/<TIN>.p12
SRC_CERT_PASSWORD=<p12-password>
CERT_ENCRYPTION_KEY=<32+ random chars>
```

### Certificate resolution priority (per receipt)

```
Restaurant.srcCertData (bytes in DB)
  ↓ if not set
Restaurant.srcCertPath (file path in DB)
  ↓ if not set
SRC_CERT_PATH + SRC_CERT_PASSWORD (global env)
  ↓ if not set
SrcConfigError → receipt fails with clear message
```

---

## Sequence Number Management

SRC requires a strictly increasing `seq` per CRN. If you migrate from another system, sync the counter:

```bash
# Check current counter
GET /api/src/sequence?crn=<CRN>

# Set to last seq SRC accepted (next call will use value+1)
POST /api/src/sequence
{ "crn": "<CRN>", "value": 1234 }
```

---

## Current Limitations

- **SMS delivery**: not wired up. Endpoint returns 501 with setup instructions. Install Twilio or another provider and implement `src/app/api/receipts/[id]/send-sms/route.ts`.
- **Multi-company certificates**: the real client reads certificate path/password from env. To support multiple companies each with their own certificate, extend `RealSrcClient` to accept per-restaurant cert config stored in the DB.
- **Server IP registration**: the outbound IP of the deployed server must be registered with SRC (u6 application → IP address). On platforms like Render, use a static outbound IP add-on.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint check |
| `npm run db:migrate` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data (mock mode only) |
| `npm run db:setup` | migrate + seed |
| `npm run test:src` | Run 31 SRC integration tests |
