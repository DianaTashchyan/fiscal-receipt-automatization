import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

function statusBadge(status: string) {
  switch (status) {
    case "FISCALIZED":  return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "FAILED":      return "bg-red-100 text-red-700 border-red-200";
    case "PENDING":
    case "FISCALIZING": return "bg-amber-100 text-amber-700 border-amber-200";
    case "SENT":        return "bg-indigo-100 text-indigo-700 border-indigo-200";
    default:            return "bg-gray-100 text-gray-600 border-gray-200";
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
  const pending      = receipts.filter((r) => r.status === "PENDING" || r.status === "FISCALIZING").length;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}>
      {/* Top hero bar */}
      <div style={{ background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)" }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Fiscal Receipts</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Receipt History</h1>
              <p className="text-sm text-slate-400 mt-1">All generated fiscal receipts and delivery statuses</p>
            </div>
            <Link
              href="/receipts/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Receipt
            </Link>
          </div>

          {/* Stats row in hero */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Total",       value: receipts.length,               color: "text-white" },
              { label: "Fiscalized",  value: fiscalized,                     color: "text-emerald-400" },
              { label: "Pending",     value: pending,                        color: "text-amber-400" },
              { label: "Revenue",     value: `${totalRevenue.toLocaleString()} ֏`, color: "text-indigo-300" },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {receipts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-2">No receipts yet</p>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">Create your first fiscal receipt to see it here.</p>
            <Link
              href="/receipts/new"
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              Create first receipt
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{receipts.length} receipt{receipts.length !== 1 ? "s" : ""}</p>
              {failed > 0 && (
                <span className="text-xs font-semibold text-red-600">{failed} failed</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="bg-gray-50/50">
                    {["Order ID", "Restaurant", "Amount", "Status", "Delivery", "Fiscal #", "Date", "Actions"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-5 py-4">
                        <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded-md">{r.externalOrderId}</code>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-900">{r.restaurant.name}</td>
                      <td className="px-5 py-4 text-sm font-bold text-gray-900">{Number(r.totalAmount).toLocaleString()} ֏</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusBadge(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500">
                        {r.sentAt ? `${r.deliveryMethod} ✓` : (r.deliveryMethod ?? "—")}
                      </td>
                      <td className="px-5 py-4">
                        {r.fiscalNumber
                          ? <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded-md">{r.fiscalNumber}</code>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Link href={`/receipts/${r.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">Open</Link>
                          <span className="text-gray-200">·</span>
                          <a href={`/api/receipts/${r.id}/pdf`} download className="text-xs font-semibold text-gray-500 hover:text-indigo-600">PDF</a>
                        </div>
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
