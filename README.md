# Electronic Fiscal Receipt Service

Backend-first MVP for generating electronic fiscal receipts for restaurants and online services.

The service allows a restaurant or external system to create a receipt, fiscalize it through a tax API integration layer, generate a PDF receipt with a QR code, store receipt history, and deliver the receipt to the customer by email or SMS link.

## Main Features

- Create electronic fiscal receipts from the web interface
- Store receipt history in PostgreSQL
- Generate PDF receipts with fiscal data and QR code
- View receipt details, items, totals, fiscal number, receipt number, and delivery status
- Send PDF receipt by email in mock mode
- Send PDF link by SMS in mock mode
- Multi-restaurant architecture
- Cashier, department, product, and receipt item models
- API key based access for external integrations
- Tax API integration layer with mock mode and VCR-ready structure
- Event logging for receipt creation, fiscalization, email delivery, and SMS delivery

## Technology Stack

- Next.js
- TypeScript
- Prisma ORM
- PostgreSQL
- pdf-lib
- qrcode
- Node.js

## Project Structure

```text
src/app
├── page.tsx                         # Main dashboard
├── receipts/page.tsx                 # Receipt history
├── receipts/new/page.tsx             # Create receipt page
├── receipts/[id]/page.tsx            # Receipt details page
├── api/receipts/route.ts             # External API for receipt creation
├── api/receipts/manual/route.ts      # Manual receipt creation from UI
├── api/receipts/[id]/pdf/route.ts    # PDF generation
├── api/receipts/[id]/send-email      # Mock email delivery
└── api/receipts/[id]/send-sms        # Mock SMS delivery

src/lib
├── prisma/client.ts                  # Prisma client
└── services/tax-api.service.ts       # Tax API / VCR integration layer

prisma
└── schema.prisma                     # Database schema
```

## Database Models

The MVP uses the following main entities:

- `User`
- `Restaurant`
- `RestaurantApiKey`
- `Cashier`
- `Department`
- `Product`
- `Receipt`
- `ReceiptItem`
- `ReceiptEvent`

This structure allows the system to support multiple restaurants, multiple cashiers, product catalogues, fiscal departments, receipt items, and a full audit trail for each receipt.

## Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://user@localhost:5432/fiscal_receipt?schema=public"

TAX_API_MODE=mock
VCR_API_BASE_URL=https://vcr.am/api/v1
VCR_API_KEY=your_vcr_api_key
```

For the current MVP, `TAX_API_MODE=mock` is used. In this mode, the service generates mock fiscal numbers, receipt numbers, and QR data without sending data to the real tax system.

Real email and SMS providers are not required for the MVP. Email and SMS delivery are currently implemented in mock mode and logged in `ReceiptEvent`.

## Installation

Install dependencies:

```bash
npm install
```

Apply Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

Run the development server:

```bash
npm run dev
```

Open the application:

```text
http://localhost:3000
```

## Main Pages

### Dashboard

```text
/
```

Shows the main product overview, statistics, and API usage example.

### Receipt History

```text
/receipts
```

Shows all generated receipts, including status, delivery method, fiscal number, total amount, PDF download link, and receipt details link.

### Create Receipt

```text
/receipts/new
```

Allows manual receipt creation through the web interface.

### Receipt Details

```text
/receipts/[id]
```

Shows full receipt data, QR code, restaurant information, items, totals, PDF link, email delivery button, and SMS delivery button.

## API Endpoints

### Get all receipts

```http
GET /api/receipts
```

Returns the list of created receipts.

### Create receipt through external API

```http
POST /api/receipts
Header: X-Api-Key: <restaurant-api-key>
Content-Type: application/json
```

Example request:

```json
{
  "externalOrderId": "order-001",
  "tableNumber": "12",
  "paymentMethod": "CARD",
  "deliveryMethod": "EMAIL",
  "customerEmail": "customer@example.com",
  "items": [
    {
      "externalProductId": "pizza-001",
      "quantity": 1,
      "unitPrice": 3500,
      "totalPrice": 3500
    }
  ]
}
```

The endpoint validates the API key, finds the restaurant, checks the default cashier, validates products, creates the receipt, creates receipt items, fiscalizes the receipt through the tax API service layer, and stores the event history.

### Create receipt manually from UI

```http
POST /api/receipts/manual
```

Used by the internal web interface for manual receipt creation.

### Generate PDF

```http
GET /api/receipts/{id}/pdf
```

Generates and returns a PDF receipt with restaurant data, fiscal number, receipt number, items, totals, and QR code.

### Send receipt by email

```http
POST /api/receipts/{id}/send-email
```

Current MVP behavior: mock email sending. The system saves the customer email, updates the delivery method, and creates an `EMAIL_SENT_MOCK` event.

### Send receipt by SMS

```http
POST /api/receipts/{id}/send-sms
```

Current MVP behavior: mock SMS sending. The system saves the customer phone, updates the delivery method, and creates an `SMS_SENT_MOCK` event with the PDF link.

## Tax API Integration

The service contains a separate tax integration layer:

```text
src/lib/services/tax-api.service.ts
```

In mock mode, it returns generated fiscal data:

- fiscal number
- receipt number
- QR data
- raw response object

The structure is prepared for real VCR / tax API integration. When real credentials are provided, the service can send sale data to the configured VCR API endpoint.

## Current MVP Limitations

- Tax API integration is currently running in mock mode
- Email delivery is currently mocked
- SMS delivery is currently mocked
- Authentication and user login are not implemented yet
- Restaurant and product management pages can be improved further
- Production deployment configuration is not included yet

## Future Improvements

- Connect real VCR / tax API credentials
- Connect real SMTP provider for email delivery
- Connect real SMS provider
- Add authentication and role-based access
- Add restaurant management UI
- Add product and department management UI
- Add filtering and search in receipt history
- Add export reports
- Add deployment configuration
- Add tests for receipt creation and fiscalization flow

## Demo Flow

1. Open the dashboard at `/`
2. Click `Create Receipt`
3. Choose restaurant, payment method, customer email or phone, and receipt items
4. Create the receipt
5. Open the receipt details page
6. Open or download the generated PDF
7. Send the receipt by email or SMS link in mock mode
8. Check receipt history and delivery status

## Summary

This MVP demonstrates the core backend architecture for an electronic fiscal receipt service. It supports receipt creation, PDF generation, QR code generation, receipt history, API-based integration, and mock delivery through email and SMS. The project is structured so that real tax API, SMTP, and SMS integrations can be connected in the next development stage.
