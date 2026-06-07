import Link from "next/link";
import Image from "next/image";
import SendEmailButton from "./send-email-button";
import SendSmsButton from "./send-sms-button";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import prisma from "@/lib/prisma/client";

function statusBg(status: string) {
  switch (status) {
    case "FISCALIZED":  return "linear-gradient(135deg, #059669, #047857)";
    case "FAILED":      return "linear-gradient(135deg, #dc2626, #b91c1c)";
    case "PENDING":
    case "FISCALIZING": return "linear-gradient(135deg, #d97706, #b45309)";
    case "SENT":        return "linear-gradient(135deg, #6366f1, #4f46e5)";
    default:            return "linear-gradient(135deg, #6b7280, #4b5563)";
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
    include: {
      restaurant: true,
      cashier: true,
      items: true,
      events: true,
      originalReceipt: { include: { restaurant: true } },
      returnReceipts: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!receipt) notFound();

  const qrText  = receipt.qrData ?? receipt.qrUrl ?? `Receipt: ${receipt.fiscalNumber ?? receipt.id}`;
  const qrImage = await QRCode.toDataURL(qrText);
  const date    = new Date(receipt.createdAt);

  const isReturn   = receipt.receiptType === "RETURN";
  const isFiscalized = ["FISCALIZED", "PDF_GENERATED", "SENT"].includes(receipt.status);
  const hasSuccessfulReturn = receipt.returnReceipts.some(
    (r) => ["FISCALIZED", "PDF_GENERATED", "SENT"].includes(r.status)
  );
  const canReturn  = isFiscalized && !isReturn && !hasSuccessfulReturn;

  const heroBg = isReturn
    ? "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)"
    : statusBg(receipt.status);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}>
      {/* Status hero bar */}
      <div style={{ background: heroBg }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/receipts"
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Receipts
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white uppercase tracking-wide border border-white/30">
                  {receipt.status}
                </span>
                {isReturn && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/40 text-red-200 border border-red-700/50">
                    RETURN
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {isReturn ? "Return Receipt" : "Receipt Details"}
              </h1>
              <p className="text-white/60 text-sm mt-1 font-mono">{receipt.externalOrderId}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canReturn && (
                <Link
                  href={`/receipts/${receipt.id}/return`}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-600/80 hover:bg-red-600 border border-red-400/50 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Return Receipt
                </Link>
              )}
              <SendEmailButton receiptId={receipt.id} defaultEmail={receipt.customerEmail} />
              <SendSmsButton receiptId={receipt.id} defaultPhone={receipt.customerPhone} />
              <a
                href={`/api/receipts/${receipt.id}/pdf`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/15 hover:bg-white/25 border border-white/30 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </a>
            </div>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Total Amount",   value: `${Number(receipt.totalAmount).toLocaleString()} ֏` },
              { label: "Fiscal Number",  value: receipt.fiscalNumber ?? "—" },
              { label: "Date",           value: date.toLocaleDateString() },
              { label: "Payment",        value: receipt.paymentMethod },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                <p className="text-xs text-white/50 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-bold text-white mt-0.5 truncate">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — details */}
          <div className="lg:col-span-2 space-y-5">

            {/* Link to original receipt (for return receipts) */}
            {isReturn && receipt.originalReceipt && (
              <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-red-100 bg-red-100/50">
                  <h2 className="text-sm font-bold text-red-900">Original Receipt</h2>
                </div>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{receipt.originalReceipt.restaurant?.name ?? "—"}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{receipt.originalReceipt.fiscalNumber ?? receipt.originalReceipt.externalOrderId}</p>
                  </div>
                  <Link
                    href={`/receipts/${receipt.originalReceipt.id}`}
                    className="text-sm font-semibold text-red-700 hover:underline flex items-center gap-1"
                  >
                    View
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}

            {/* Return receipts (for original receipts) */}
            {!isReturn && receipt.returnReceipts.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-orange-100 bg-orange-100/50">
                  <h2 className="text-sm font-bold text-orange-900">
                    Return Receipts ({receipt.returnReceipts.length})
                  </h2>
                </div>
                <div className="divide-y divide-orange-100">
                  {receipt.returnReceipts.map((ret) => (
                    <div key={ret.id} className="px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-mono text-gray-500">{ret.fiscalNumber ?? ret.externalOrderId}</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {Number(ret.totalAmount).toLocaleString()} ֏ refund
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(ret.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          ret.status === "FISCALIZED" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                          ret.status === "FAILED" ? "bg-red-100 text-red-700 border-red-200" :
                          "bg-amber-100 text-amber-700 border-amber-200"
                        }`}>
                          {ret.status}
                        </span>
                        <Link href={`/receipts/${ret.id}`} className="text-sm font-semibold text-orange-700 hover:underline">
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-900">Transaction Details</h2>
              </div>
              <dl className="divide-y divide-gray-50">
                {[
                  { label: "Order ID",        value: receipt.externalOrderId, mono: true },
                  { label: "Receipt Number",  value: receipt.receiptNumber ?? "—", mono: true },
                  { label: "Fiscal Number",   value: receipt.fiscalNumber ?? "—", mono: true },
                  { label: "Cash Register",   value: receipt.srcSn ?? "—", mono: true },
                  { label: "SRC Mode",        value: receipt.srcMode ?? "—" },
                  { label: "Payment",         value: receipt.paymentMethod },
                  { label: "Cashier",         value: receipt.cashier?.name ?? "—" },
                  { label: "Tax Cashier ID",  value: receipt.cashier?.taxCashierId ?? "—", mono: true },
                  { label: "Date & Time",     value: `${date.toLocaleDateString()} ${date.toLocaleTimeString()}` },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3">
                    <dt className="text-xs text-gray-500 font-medium">{label}</dt>
                    <dd className={`text-sm font-semibold text-gray-900 text-right max-w-[60%] break-all ${mono ? "font-mono text-xs bg-gray-100 px-2 py-0.5 rounded" : ""}`}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Restaurant */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-900">Restaurant</h2>
              </div>
              <dl className="divide-y divide-gray-50">
                {[
                  { label: "Name",    value: receipt.restaurant.name },
                  { label: "TIN",     value: receipt.restaurant.tin, mono: true },
                  { label: "CRN",     value: receipt.restaurant.crn ?? "—", mono: true },
                  { label: "Address", value: receipt.restaurant.address ?? "—" },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3">
                    <dt className="text-xs text-gray-500 font-medium">{label}</dt>
                    <dd className={`text-sm font-semibold text-gray-900 text-right ${mono ? "font-mono text-xs bg-gray-100 px-2 py-0.5 rounded" : ""}`}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Items */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-900">
                  {isReturn ? "Returned Items" : "Items"}
                </h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50">
                    {["Product", "Qty", "Unit Price", "Total"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {receipt.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-4 text-sm font-semibold text-gray-900">{item.name}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{item.quantity.toString()}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{Number(item.unitPrice).toLocaleString()} ֏</td>
                      <td className="px-5 py-4 text-sm font-bold text-gray-900">{Number(item.totalPrice).toLocaleString()} ֏</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Bill</span><span className="font-semibold">{Number(receipt.billAmount).toLocaleString()} ֏</span>
                </div>
                {!isReturn && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Tip</span><span className="font-semibold">{Number(receipt.tipAmount).toLocaleString()} ֏</span>
                  </div>
                )}
                <div className={`flex justify-between text-base font-bold pt-2 border-t border-gray-200 ${isReturn ? "text-red-700" : "text-gray-900"}`}>
                  <span>{isReturn ? "Refund Total" : "Total"}</span>
                  <span>{Number(receipt.totalAmount).toLocaleString()} ֏</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column — QR + actions */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-900">QR Code</h2>
              </div>
              <div className="p-5 flex flex-col items-center">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <Image src={qrImage} alt="Receipt QR Code" width={180} height={180} unoptimized />
                </div>
                <p className="mt-4 text-xs text-gray-400 text-center break-all leading-relaxed">{qrText}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-sm font-bold text-gray-900">Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                <a
                  href={`/api/receipts/${receipt.id}/pdf`}
                  target="_blank"
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #0d1117, #1a1f2e)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Open PDF
                </a>

                {canReturn && (
                  <Link
                    href={`/receipts/${receipt.id}/return`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                    style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Return Receipt
                  </Link>
                )}
                {!canReturn && isFiscalized && !isReturn && hasSuccessfulReturn && (
                  <div className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-gray-400 bg-gray-100 rounded-xl border border-gray-200 cursor-not-allowed">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Already Returned
                  </div>
                )}
              </div>
            </div>

            {/* Event log */}
            {receipt.events.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h2 className="text-sm font-bold text-gray-900">Audit Log</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {[...receipt.events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((ev) => (
                    <div key={ev.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-700 font-mono break-all">{ev.event}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">
                          {new Date(ev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      {(ev.fromStatus || ev.toStatus) && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {ev.fromStatus ?? "—"} → {ev.toStatus ?? "—"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
