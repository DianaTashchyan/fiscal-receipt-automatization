import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

export default async function RestaurantsPage() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { receipts: true, cashiers: true, departments: true, products: true } },
    },
  });

  const live    = restaurants.filter((r) => (r.srcOnboardingStep ?? 0) >= 12).length;
  const pending = restaurants.length - live;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)" }}>
        <div className="px-7 py-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Registered</p>
            <h1 className="text-xl font-bold text-white tracking-tight">Restaurants</h1>
            <p className="text-sm text-slate-400 mt-0.5">{live} live · {pending} in setup</p>
          </div>
          <Link
            href="/admin/restaurants/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity shadow-md"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Restaurant
          </Link>
        </div>
      </div>

      {restaurants.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-20 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-2">No restaurants yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">Onboard your first restaurant to start issuing fiscal receipts through SRC.</p>
          <Link
            href="/admin/restaurants/new"
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            Onboard first restaurant
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {restaurants.map((r) => {
            const step     = r.srcOnboardingStep ?? 0;
            const complete = step >= 12;
            const hasCert  = !!(r.srcCertData || r.srcCertPath);
            const wizStep  = step <= 0 ? 1 : step <= 2 ? step : step === 3 ? 3 : step === 4 ? 4 : step <= 9 ? 5 : step === 10 ? 6 : step === 11 ? 7 : 8;

            return (
              <div
                key={r.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-stretch">
                  {/* Color strip */}
                  <div
                    className="w-1.5 shrink-0"
                    style={{ background: complete ? "linear-gradient(180deg, #059669, #047857)" : hasCert ? "linear-gradient(180deg, #6366f1, #4f46e5)" : "linear-gradient(180deg, #d97706, #b45309)" }}
                  />

                  <div className="flex-1 flex items-center gap-4 px-5 py-4">
                    {/* Icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: complete ? "linear-gradient(135deg, #d1fae5, #a7f3d0)" : "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}
                    >
                      <svg className={`w-5 h-5 ${complete ? "text-emerald-600" : "text-violet-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-0.5">
                        <h3 className="font-bold text-gray-900 truncate">{r.name}</h3>
                        {!r.isActive && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-semibold">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono">TIN: {r.tin}{r.crn ? ` · CRN: ${r.crn}` : ""}</p>
                      {r.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.address}</p>}
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex gap-2">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          hasCert ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {hasCert ? "Cert ✓" : "No cert"}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                          complete ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : step > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                        }`}>
                          {complete ? "✓ Live" : step > 0 ? `Step ${wizStep}/8` : "New"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {r._count.receipts} receipts · {r._count.products} products
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex flex-col gap-2">
                      <Link
                        href={`/admin/restaurants/${r.id}`}
                        className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-center"
                      >
                        Manage
                      </Link>
                      {!complete && (
                        <Link
                          href={`/admin/restaurants/${r.id}/onboarding`}
                          className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 text-center"
                          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                        >
                          Onboarding →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
