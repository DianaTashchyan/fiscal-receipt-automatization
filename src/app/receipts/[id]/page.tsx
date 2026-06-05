import Link from "next/link";
import Image from "next/image";
import SendEmailButton from "./send-email-button";
import SendSmsButton from "./send-sms-button";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import prisma from "@/lib/prisma/client";

function statusClass(status: string) {
  switch (status) {
    case "FISCALIZED":  return "bg-emerald-100 text-emerald-700";
    case "FAILED":      return "bg-red-100 text-red-700";
    case "PENDING":
    case "FISCALIZING": return "bg-amber-100 text-amber-700";
    case "SENT":        return "bg-blue-100 text-blue-700";
    default:            return "bg-gray-100 text-gray-600";
  }
}

export default async function ReceiptDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where:   { id },
    include: { restaurant: true, cashier: true, items: true, events: true },
  });

  if (!receipt) notFound();

  const qrText  = receipt.qrData ?? receipt.qrUrl ?? `Receipt: ${receipt.fiscalNumber ?? receipt.id}`;
  const qrImage = await QRCode.toDataURL(qrText);
  const date    = new Date(receipt.createdAt);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/receipts"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Receipts
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Receipt Details</h1>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass(receipt.status)}`}>
                  {receipt.status}
                </span>
              </div>
              <code className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{receipt.externalOrderId}</code>
            </div>
            <div className="flex gap-2">
              <SendEmailButton receiptId={receipt.id} defaultEmail={receipt.customerEmail} />
              <SendSmsButton receiptId={receipt.id} defaultPhone={receipt.customerPhone} />
              <a
                href={`/api/receipts/${receipt.id}/pdf`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* General + QR side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="sm:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">General</h2>
              <dl className="space-y-2.5">
                {[
                  { label: "Status",           value: receipt.status },
                  { label: "Fiscal Number",    value: receipt.fiscalNumber ?? "—" },
                  { label: "Receipt Number",   value: receipt.receiptNumber ?? "—" },
                  { label: "Cash Register SN", value: receipt.srcSn ?? "—" },
                  { label: "SRC Mode",         value: receipt.srcMode ?? "—" },
                  { label: "Payment",          value: receipt.paymentMethod },
                  { label: "Date",             value: date.toLocaleDateString() },
                  { label: "Time",             value: date.toLocaleTimeString() },
                  { label: "Cashier",          value: receipt.cashier?.name ?? "—" },
                  { label: "Tax Cashier ID",   value: receipt.cashier?.taxCashierId ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <dt className="text-xs text-gray-500 shrink-0 pt-0.5">{label}</dt>
                    <dd className="text-sm text-gray-900 font-medium text-right break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 self-start">QR Code</h2>
              <Image src={qrImage} alt="Receipt QR Code" width={160} height={160} unoptimized className="rounded-lg" />
              <p className="mt-3 text-xs text-gray-400 text-center break-all leading-relaxed">{qrText}</p>
            </div>
          </div>

          {/* Restaurant */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Restaurant</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              {[
                { label: "Name",    value: receipt.restaurant.name },
                { label: "TIN",     value: receipt.restaurant.tin },
                { label: "CRN",     value: receipt.restaurant.crn ?? "—" },
                { label: "Address", value: receipt.restaurant.address ?? "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500 mb-0.5">{label}</dt>
                  <dd className="text-sm text-gray-900 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Items */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">Items</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Qty", "Unit Price", "Total"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receipt.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3.5 text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{item.quantity.toString()}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{item.unitPrice.toString()} ֏</td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">{item.totalPrice.toString()} ֏</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Totals</h2>
            <dl className="space-y-2">
              <div className="flex justify-between items-center">
                <dt className="text-sm text-gray-500">Bill</dt>
                <dd className="text-sm font-semibold text-gray-900">{receipt.billAmount.toString()} ֏</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-sm text-gray-500">Tip</dt>
                <dd className="text-sm font-semibold text-gray-900">{receipt.tipAmount.toString()} ֏</dd>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <dt className="text-base font-bold text-gray-900">Total</dt>
                <dd className="text-xl font-bold text-gray-900">{receipt.totalAmount.toString()} ֏</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
