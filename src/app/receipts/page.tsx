import Link from "next/link";
import prisma from "@/lib/prisma/client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReceiptsPage() {
  const receipts = await prisma.receipt.findMany({
    include: {
      restaurant: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const totalReceipts = receipts.length;
  const fiscalized = receipts.filter((r) => r.status === "FISCALIZED").length;
  const sent = receipts.filter((r) => r.sentAt !== null).length;
  const failed = receipts.filter((r) => r.status === "FAILED").length;
  const totalRevenue = receipts.reduce(
    (sum, r) => sum + Number(r.totalAmount),
    0
  );

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <div style={header}>
        <div>
          <h1 style={{ margin: 0 }}>Receipt History</h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>
            All generated fiscal receipts and delivery statuses.
          </p>
        </div>

        <Link href="/receipts/new" style={createButton}>
          + Create New Receipt
        </Link>
      </div>

      <section style={statsGrid}>
        <div style={statCard}>
          <span style={statLabel}>Total Receipts</span>
          <b style={statValue}>{totalReceipts}</b>
        </div>

        <div style={statCard}>
          <span style={statLabel}>Fiscalized</span>
          <b style={statValue}>{fiscalized}</b>
        </div>

        <div style={statCard}>
          <span style={statLabel}>Sent</span>
          <b style={statValue}>{sent}</b>
        </div>

        <div style={statCard}>
          <span style={statLabel}>Failed</span>
          <b style={statValue}>{failed}</b>
        </div>

        <div style={statCard}>
          <span style={statLabel}>Total Revenue</span>
          <b style={statValue}>{totalRevenue.toFixed(2)} AMD</b>
        </div>
      </section>

      <section style={tableCard}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Order ID</th>
              <th style={th}>Restaurant</th>
              <th style={th}>Total</th>
              <th style={th}>Status</th>
              <th style={th}>Delivery</th>
              <th style={th}>Fiscal Number</th>
              <th style={th}>Details</th>
              <th style={th}>PDF</th>
            </tr>
          </thead>

          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td style={td}>{receipt.externalOrderId}</td>
                <td style={td}>{receipt.restaurant.name}</td>
                <td style={td}>{receipt.totalAmount.toString()} AMD</td>
                <td style={td}>
                  <span style={statusBadge(receipt.status)}>
                    {receipt.status}
                  </span>
                </td>
                <td style={td}>
                  {receipt.sentAt
                    ? `${receipt.deliveryMethod} sent`
                    : receipt.deliveryMethod}
                </td>
                <td style={td}>{receipt.fiscalNumber ?? "-"}</td>
                <td style={td}>
                  <Link href={`/receipts/${receipt.id}`} style={link}>
                    Open receipt
                  </Link>
                </td>
                <td style={td}>
                  <a
                    href={`/api/receipts/${receipt.id}/pdf`}
                    download
                    style={link}
                  >
                    Download PDF
                  </a>
                </td>
              </tr>
            ))}

            {receipts.length === 0 && (
              <tr>
                <td style={emptyCell} colSpan={8}>
                  No receipts yet. Create your first receipt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function statusBadge(status: string) {
  let background = "#e5e7eb";
  let color = "#111827";

  if (status === "FISCALIZED") {
    background = "#dcfce7";
    color = "#166534";
  }

  if (status === "FAILED") {
    background = "#fee2e2";
    color = "#991b1b";
  }

  if (status === "PENDING" || status === "FISCALIZING") {
    background = "#fef3c7";
    color = "#92400e";
  }

  if (status === "SENT") {
    background = "#dbeafe";
    color = "#1e40af";
  }

  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background,
    color,
    fontSize: 12,
    fontWeight: "bold",
  };
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap" as const,
};

const createButton = {
  padding: "12px 18px",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: "bold",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 16,
  marginTop: 28,
};

const statCard = {
  padding: 20,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
};

const statLabel = {
  display: "block",
  color: "#6b7280",
  fontSize: 13,
  marginBottom: 8,
};

const statValue = {
  fontSize: 22,
};

const tableCard = {
  marginTop: 28,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  overflow: "hidden",
  overflowX: "auto" as const,
};

const th = {
  borderBottom: "1px solid #ddd",
  padding: "12px",
  textAlign: "left" as const,
  background: "#f9fafb",
  fontSize: 13,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "12px",
  fontSize: 14,
};

const emptyCell = {
  padding: 32,
  textAlign: "center" as const,
  color: "#6b7280",
};

const link = {
  color: "#2563eb",
  fontWeight: "bold",
  textDecoration: "none",
};