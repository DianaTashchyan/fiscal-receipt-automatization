import Link from "next/link";
import SendEmailButton from "./send-email-button";
import SendSmsButton from "./send-sms-button";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import prisma from "@/lib/prisma/client";

export default async function ReceiptDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      restaurant: true,
      cashier: true,
      items: true,
      events: true,
    },
  });

  if (!receipt) {
    notFound();
  }

  const qrText =
    receipt.qrData ??
    receipt.qrUrl ??
    `Receipt: ${receipt.fiscalNumber ?? receipt.id}`;

  const qrImage = await QRCode.toDataURL(qrText);
  const createdDate = new Date(receipt.createdAt);

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <Link href="/receipts">← Back to receipts</Link>

      <h1 style={{ marginTop: 24 }}>Receipt Details</h1>

      <section style={card}>
        <h2>General</h2>
        <p><b>Order ID:</b> {receipt.externalOrderId}</p>
        <p><b>Status:</b> {receipt.status}</p>
        <p><b>Fiscal Number:</b> {receipt.fiscalNumber ?? "-"}</p>
        <p><b>Receipt Number:</b> {receipt.receiptNumber ?? "-"}</p>
        <p><b>Cash Register SN:</b> {receipt.srcSn ?? "-"}</p>
        <p><b>SRC Mode:</b> {receipt.srcMode ?? "-"}</p>
        <p><b>Payment:</b> {receipt.paymentMethod}</p>
        <p><b>Date:</b> {createdDate.toLocaleDateString()}</p>
        <p><b>Time:</b> {createdDate.toLocaleTimeString()}</p>
        <p><b>Cashier:</b> {receipt.cashier?.name ?? "-"}</p>
        <p><b>Tax Cashier ID:</b> {receipt.cashier?.taxCashierId ?? "-"}</p>
      </section>

      <section style={card}>
        <h2>QR Code</h2>
        <img
          src={qrImage}
          alt="Receipt QR Code"
          width={180}
          height={180}
        />
        <p style={{ marginTop: 12, fontSize: 13, color: "#555" }}>
          {qrText}
        </p>
      </section>

      <section style={card}>
        <h2>Restaurant</h2>
        <p><b>Name:</b> {receipt.restaurant.name}</p>
        <p><b>TIN:</b> {receipt.restaurant.tin}</p>
        <p><b>CRN:</b> {receipt.restaurant.crn}</p>
        <p><b>Address:</b> {receipt.restaurant.address}</p>
      </section>

      <section style={card}>
        <h2>Items</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Qty</th>
              <th style={th}>Unit Price</th>
              <th style={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item) => (
              <tr key={item.id}>
                <td style={td}>{item.name}</td>
                <td style={td}>{item.quantity.toString()}</td>
                <td style={td}>{item.unitPrice.toString()} AMD</td>
                <td style={td}>{item.totalPrice.toString()} AMD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2>Total</h2>
        <p><b>Bill:</b> {receipt.billAmount.toString()} AMD</p>
        <p><b>Tip:</b> {receipt.tipAmount.toString()} AMD</p>
        <p style={{ fontSize: 24 }}>
          <b>Total:</b> {receipt.totalAmount.toString()} AMD
        </p>
      </section>
      <SendEmailButton
  receiptId={receipt.id}
  defaultEmail={receipt.customerEmail}
/>
<SendSmsButton
  receiptId={receipt.id}
  defaultPhone={receipt.customerPhone}
/>
      <a
        href={`/api/receipts/${receipt.id}/pdf`}
        target="_blank"
        style={button}
      >
        Open PDF
      </a>
    </main>
  );
}

const card = {
  marginTop: 24,
  padding: 24,
  border: "1px solid #ddd",
  borderRadius: 12,
  background: "#fff",
};

const th = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  textAlign: "left" as const,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: 12,
};

const button = {
  display: "inline-block",
  marginTop: 24,
  padding: "12px 18px",
  background: "#111827",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
};
