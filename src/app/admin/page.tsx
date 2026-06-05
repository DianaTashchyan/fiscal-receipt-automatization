import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  FISCALIZED:  "bg-emerald-100 text-emerald-700",
  FAILED:      "bg-red-100 text-red-700",
  PENDING:     "bg-amber-100 text-amber-700",
  FISCALIZING: "bg-blue-100 text-blue-700",
  SENT:        "bg-indigo-100 text-indigo-700",
};

export default async function AdminDashboard() {
  const [restCount, receiptCount, failedCount, pendingCount] = await Promise.all([
    prisma.restaurant.count(),
    prisma.receipt.count(),
    prisma.receipt.count({ where: { status: "FAILED" } }),
    prisma.receipt.count({ where: { status: { in: ["PENDING", "FISCALIZING"] } } }),
  ]);

  const recentReceipts = await prisma.receipt.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { restaurant: { select: { name: true } } },
  });

  const liveRestaurants = await prisma.restaurant.count({ where: { srcOnboardingStep: { gte: 12 }, isActive: true } });

  const stats = [
    {
      label: "Restaurants",
      value: restCount,
      sub: `${liveRestaurants} live`,
      href: "/admin/restaurants",
      gradient: "from-violet-600 to-indigo-600",
      icon: (
        <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
        </svg>
      ),
    },
    {
      label: "Total Receipts",
      value: receiptCount,
      sub: "all time",
      href: "/receipts",
      gradient: "from-emerald-500 to-teal-600",
      icon: (
        <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    {
      label: "Failed",
      value: failedCount,
      sub: failedCount === 0 ? "all clear" : "need attention",
      href: "/receipts",
      gradient: failedCount > 0 ? "from-red-500 to-rose-600" : "from-slate-500 to-slate-600",
      icon: (
        <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
    },
    {
      label: "In Progress",
      value: pendingCount,
      sub: pendingCount === 0 ? "queue empty" : "fiscalizing",
      href: "/receipts",
      gradient: pendingCount > 0 ? "from-amber-500 to-orange-500" : "from-slate-500 to-slate-600",
      icon: (
        <svg className="w-6 h-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page hero */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)" }}>
        <div className="px-8 py-7 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Overview</p>
            <h1 className="text-2xl font-bold text-white tracking-tight">Electronic Fiscal Receipts</h1>
            <p className="text-sm text-slate-400 mt-1">Armenian SRC / VCR Integration — Admin Panel</p>
          </div>
          <Link
            href="/admin/restaurants/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Onboard Restaurant
          </Link>
        </div>
      </div>

      {/* Gradient stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${s.gradient} p-5 text-white hover:opacity-95 transition-opacity shadow-lg`}
          >
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)" }}
            />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  {s.icon}
                </div>
              </div>
              <div className="text-3xl font-bold tracking-tight">{s.value}</div>
              <div className="text-xs font-semibold text-white/70 mt-0.5 uppercase tracking-wide">{s.label}</div>
              <div className="text-xs text-white/50 mt-0.5">{s.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              {
                href: "/admin/restaurants/new",
                label: "Onboard New Restaurant",
                sub: "Register a new TIN and start SRC setup",
                gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                textColor: "text-white",
              },
              {
                href: "/admin/restaurants",
                label: "View All Restaurants",
                sub: "Manage onboarding and configuration",
                gradient: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                textColor: "text-gray-800",
                border: true,
              },
              {
                href: "/receipts/new",
                label: "Create Test Receipt",
                sub: "Manually issue a fiscal receipt",
                gradient: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                textColor: "text-gray-800",
                border: true,
              },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl hover:opacity-90 transition-opacity ${a.border ? "border border-gray-200" : ""}`}
                style={{ background: a.gradient }}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${a.textColor}`}>{a.label}</p>
                  <p className={`text-xs mt-0.5 ${a.textColor === "text-white" ? "text-white/70" : "text-gray-500"}`}>{a.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent receipts — spans 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Receipts</h2>
            <Link href="/receipts" className="text-xs font-semibold text-indigo-600 hover:underline">View all →</Link>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">No receipts yet</p>
              <p className="text-xs text-gray-500 mb-4 max-w-xs">Create a test receipt to verify the fiscalization flow is working end-to-end.</p>
              <Link
                href="/receipts/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                Create test receipt
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentReceipts.map((r) => (
                <Link
                  key={r.id}
                  href={`/receipts/${r.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors group"
                >
                  <div className="min-w-0 mr-3">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                      {r.restaurant.name}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{r.externalOrderId}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm font-bold text-gray-900">{Number(r.totalAmount).toLocaleString()} ֏</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {r.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Production warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-0.5">Production checklist</p>
            <p className="text-sm text-amber-700">
              Set{" "}
              <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">TAX_API_MODE=src_real</code>,
              upload a valid SRC certificate per restaurant via onboarding, and register your server&apos;s outbound IP in the SRC u6 cabinet before issuing real receipts.{" "}
              <Link href="/docs" className="font-bold underline text-amber-800">Instructions →</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
