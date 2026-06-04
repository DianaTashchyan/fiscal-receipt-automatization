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

  const stats = [
    { label: "Restaurants", value: restCount,   color: "blue",  icon: "🏪" },
    { label: "Total Receipts", value: receiptCount, color: "green", icon: "🧾" },
    { label: "Failed",       value: failedCount,  color: "red",   icon: "⚠️" },
    { label: "In Progress",  value: pendingCount, color: "yellow",icon: "⏳" },
  ];

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Electronic Fiscal Receipt Service — Admin</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            <Link href="/admin/restaurants/new"
              className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              + Onboard New Restaurant
            </Link>
            <Link href="/admin/restaurants"
              className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              View All Restaurants
            </Link>
            <Link href="/receipts/new"
              className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Create Receipt (UI)
            </Link>
            <Link href="/docs"
              className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              📖 SRC Onboarding Guide
            </Link>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recent Receipts</h2>
          {recentReceipts.length === 0 ? (
            <p className="text-gray-400 text-sm">No receipts yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentReceipts.map((r) => (
                <Link key={r.id} href={`/receipts/${r.id}`}
                  className="flex justify-between items-center text-sm py-1.5 hover:text-blue-600">
                  <span className="text-gray-600 truncate mr-2">{r.restaurant.name} — {r.externalOrderId}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === "FISCALIZED" ? "bg-green-100 text-green-700"
                    : r.status === "FAILED" ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
                  }`}>{r.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
        <strong>Production checklist:</strong>{" "}
        Set <code className="bg-amber-100 px-1 rounded">TAX_API_MODE=src_real</code>,{" "}
        upload a valid .p12 certificate per restaurant via the onboarding wizard, and{" "}
        register your server&apos;s outbound IP in the SRC u6 cabinet before issuing real receipts.
        <Link href="/docs" className="ml-2 text-amber-700 underline font-medium">Instructions →</Link>
      </div>
    </div>
  );
}
