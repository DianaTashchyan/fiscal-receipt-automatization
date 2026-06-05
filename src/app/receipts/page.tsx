import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

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

export default async function ReceiptsPage() {
  const receipts = await prisma.receipt.findMany({
    include: { restaurant: true },
    orderBy:  { createdAt: "desc" },
  });

  const totalRevenue = receipts.reduce((sum, r) => sum + Number(r.totalAmount), 0);
  const fiscalized   = receipts.filter((r) => r.status === "FISCALIZED").length;
  const failed       = receipts.filter((r) => r.status === "FAILED").length;
  const sent         = receipts.filter((r) => r.sentAt !== null).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Receipt History</h1>
            <p className="text-sm text-gray-500 mt-1">All generated fiscal receipts and delivery statuses.</p>
          </div>
          <Link
            href="/receipts/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Receipt
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Receipts",  value: receipts.length },
            { label: "Fiscalized",      value: fiscalized },
            { label: "Sent",            value: sent },
            { label: "Failed",          value: failed },
            { label: "Total Revenue",   value: `${totalRevenue.toLocaleString()} ֏` },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-1.5">{s.label}</p>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {receipts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No receipts yet</h3>
            <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Create your first receipt to see it here.</p>
            <Link
              href="/receipts/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Create first receipt
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {["Order ID", "Restaurant", "Total", "Status", "Delivery", "Fiscal #", "Details", "PDF"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <code className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{receipt.externalOrderId}</code>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-900">{receipt.restaurant.name}</td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">{receipt.totalAmount.toString()} ֏</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass(receipt.status)}`}>
                          {receipt.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {receipt.sentAt ? `${receipt.deliveryMethod} sent` : (receipt.deliveryMethod ?? "—")}
                      </td>
                      <td className="px-5 py-3.5">
                        {receipt.fiscalNumber ? (
                          <code className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{receipt.fiscalNumber}</code>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/receipts/${receipt.id}`} className="text-sm text-blue-600 hover:underline font-semibold">
                          Open
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <a href={`/api/receipts/${receipt.id}/pdf`} download className="text-sm text-blue-600 hover:underline font-semibold">
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
