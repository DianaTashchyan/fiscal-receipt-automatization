import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma/client";
import ReturnReceiptForm from "../return-form";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export default async function ReturnReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { restaurant: true },
  });

  if (!receipt) notFound();

  const isFiscalized = ["FISCALIZED", "PDF_GENERATED", "SENT"].includes(receipt.status);
  const isReturn = receipt.receiptType === "RETURN";

  if (!isFiscalized || isReturn) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center max-w-md">
          <p className="text-lg font-bold text-gray-900 mb-2">Return Not Available</p>
          <p className="text-sm text-gray-500 mb-6">
            {isReturn
              ? "This is already a return receipt — it cannot be returned again."
              : "Only fiscalized receipts can be returned."}
          </p>
          <Link href={`/receipts/${id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
            Back to receipt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}>
      {/* Hero bar */}
      <div style={{ background: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)" }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            href={`/receipts/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Receipt
          </Link>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Return Receipt</h1>
              <p className="text-white/60 text-sm mt-1">
                Creating refund for {receipt.restaurant.name} — fiscal&nbsp;
                <span className="font-mono text-white/80">{receipt.fiscalNumber ?? receipt.externalOrderId}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            {[
              { label: "Restaurant",    value: receipt.restaurant.name },
              { label: "Original Total", value: `${Number(receipt.totalAmount).toLocaleString()} ֏` },
              { label: "Payment",       value: receipt.paymentMethod },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 border border-white/20 rounded-xl px-4 py-3">
                <p className="text-xs text-white/50 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-bold text-white mt-0.5 truncate">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <ReturnReceiptForm
          receiptId={id}
          receiptFiscalNumber={receipt.fiscalNumber}
          receiptDate={new Date(receipt.createdAt).toLocaleDateString()}
          receiptTotal={Number(receipt.totalAmount)}
        />
      </div>
    </div>
  );
}
