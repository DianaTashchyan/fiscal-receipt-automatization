import Link from "next/link";
import prisma from "@/lib/prisma/client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [restaurants, products, cashiers, receipts, failedReceipts, sentReceipts] =
    await Promise.all([
      prisma.restaurant.count(),
      prisma.product.count(),
      prisma.cashier.count(),
      prisma.receipt.count(),
      prisma.receipt.count({ where: { status: "FAILED" } }),
      prisma.receipt.count({ where: { sentAt: { not: null } } }),
    ]);

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <section style={hero}>
        <div>
          <p style={eyebrow}>MVP / Backend-first fiscal receipt platform</p>
          <h1 style={title}>Electronic Fiscal Receipt Service</h1>
          <p style={subtitle}>
            Generate electronic fiscal receipts, create PDF documents, store receipt
            history, and deliver receipts to customers by email or SMS link.
          </p>

          <div style={actions}>
            <Link href="/admin" style={primaryButton}>
              Admin Dashboard
            </Link>
            <Link href="/receipts/new" style={secondaryButton}>
              + Create Receipt
            </Link>
            <Link href="/docs" style={{ ...secondaryButton, background: "#4b5563" }}>
              📖 SRC Guide
            </Link>
          </div>
        </div>

        <div style={infoBox}>
          <h3 style={{ marginTop: 0 }}>MVP Features</h3>
          <p>✓ Receipt creation + SRC fiscalization</p>
          <p>✓ PDF generation with QR code</p>
          <p>✓ Email delivery (SMTP)</p>
          <p>✓ SMS delivery (requires provider)</p>
          <p>✓ API-key authenticated POS integration</p>
          <p>✓ Per-restaurant mTLS certificate storage</p>
        </div>
      </section>

      <section style={statsGrid}>
        <Card title="Restaurants" value={restaurants} />
        <Card title="Products" value={products} />
        <Card title="Cashiers" value={cashiers} />
        <Card title="Receipts" value={receipts} />
        <Card title="Sent" value={sentReceipts} />
        <Card title="Failed" value={failedReceipts} />
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Integration API</h2>
        <p style={{ color: "#6b7280" }}>
          External systems can create receipts through a secured API using an
          X-Api-Key header. This makes the service suitable for restaurants, POS
          systems, online ordering platforms, and delivery services.
        </p>

        <pre style={codeBlock}>
{`POST /api/receipts
Header: X-Api-Key: <restaurant-api-key>

{
  "externalOrderId": "order-001",
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
}`}
        </pre>
      </section>
    </main>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div style={statCard}>
      <span style={statLabel}>{title}</span>
      <b style={statValue}>{value}</b>
    </div>
  );
}

const hero = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 24,
  alignItems: "stretch",
};

const eyebrow = {
  color: "#2563eb",
  fontWeight: "bold",
  marginBottom: 12,
};

const title = {
  fontSize: "clamp(30px, 8vw, 44px)",
  margin: 0,
  maxWidth: 720,
  lineHeight: 1.1,
};

const subtitle = {
  marginTop: 18,
  color: "#4b5563",
  fontSize: 18,
  lineHeight: 1.6,
  maxWidth: 780,
};

const actions = {
  display: "flex",
  gap: 12,
  marginTop: 28,
  flexWrap: "wrap" as const,
};

const primaryButton = {
  display: "inline-block",
  padding: "14px 20px",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: "bold",
  textAlign: "center" as const,
};

const secondaryButton = {
  display: "inline-block",
  padding: "14px 20px",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: "bold",
  textAlign: "center" as const,
};

const infoBox = {
  padding: 24,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#f9fafb",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 16,
  marginTop: 36,
};

const statCard = {
  padding: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
};

const statLabel = {
  display: "block",
  color: "#6b7280",
  fontSize: 13,
  marginBottom: 8,
};

const statValue = {
  fontSize: 28,
};

const card = {
  marginTop: 36,
  padding: 24,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
};

const codeBlock = {
  marginTop: 16,
  padding: 18,
  background: "#111827",
  color: "#f9fafb",
  borderRadius: 12,
  overflowX: "auto" as const,
  fontSize: 13,
  lineHeight: 1.6,
  maxWidth: "100%",
};