import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [restCount, receiptCount, failedCount, pendingCount] = await Promise.all([
    prisma.restaurant.count(),
    prisma.receipt.count(),
    prisma.receipt.count({ where: { status: "FAILED" } }),
    prisma.receipt.count({ where: { status: { in: ["PENDING", "FISCALIZING"] } } }),
  ]);

  const recentReceipts = await prisma.receipt.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { restaurant: { select: { name: true } } },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Electronic Fiscal Receipt Service — Admin Panel</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Restaurants" value={restCount} href="/admin/restaurants" color="blue" />
        <StatCard label="Total Receipts" value={receiptCount} href="/receipts" color="emerald" />
        <StatCard label="Failed" value={failedCount} href="/receipts" color="red" />
        <StatCard label="In Progress" value={pendingCount} href="/receipts" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            <Link
              href="/admin/restaurants/new"
              className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Onboard New Restaurant
            </Link>
            <Link
              href="/admin/restaurants"
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              View All Restaurants
            </Link>
            <Link
              href="/receipts/new"
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Create Test Receipt
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-3 px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              SRC Onboarding Guide
            </Link>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Recent Receipts</h2>
            <Link href="/receipts" className="text-xs text-blue-600 hover:underline font-medium">
              View all →
            </Link>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">No receipts yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentReceipts.map((r) => (
                <Link
                  key={r.id}
                  href={`/receipts/${r.id}`}
                  className="flex justify-between items-center py-2.5 group"
                >
                  <div className="min-w-0 mr-3">
                    <p className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors truncate">
                      {r.restaurant.name}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">{r.externalOrderId}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
        <div className="flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>
            <strong>Production checklist:</strong>{" "}
            Set <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">TAX_API_MODE=src_real</code>,{" "}
            upload a valid certificate per restaurant via the onboarding wizard, and register your server&apos;s outbound IP in the SRC u6 cabinet before issuing real receipts.{" "}
            <Link href="/docs" className="font-semibold underline text-amber-700">Instructions →</Link>
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, color }: { label: string; value: number; href: string; color: "blue" | "emerald" | "red" | "amber" }) {
  const colors = {
    blue:    { bg: "bg-blue-50",    text: "text-blue-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    red:     { bg: "bg-red-50",     text: "text-red-500" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-500" },
  }[color];

  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center mb-3`}>
        <span className={`text-base font-bold ${colors.text}`}>#</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    FISCALIZED:  "bg-emerald-100 text-emerald-700",
    FAILED:      "bg-red-100 text-red-700",
    PENDING:     "bg-amber-100 text-amber-700",
    FISCALIZING: "bg-amber-100 text-amber-700",
    SENT:        "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
