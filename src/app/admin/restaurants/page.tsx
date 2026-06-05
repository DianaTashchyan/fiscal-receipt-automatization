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

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Restaurants</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurants.length === 0 ? "No restaurants yet" : `${restaurants.length} registered`}
          </p>
        </div>
        <Link
          href="/admin/restaurants/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Restaurant
        </Link>
      </div>

      {restaurants.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">No restaurants yet</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
            Onboard your first restaurant to start issuing fiscal receipts.
          </p>
          <Link
            href="/admin/restaurants/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Onboard first restaurant
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {restaurants.map((r) => {
            const step = r.srcOnboardingStep ?? 0;
            const complete = step >= 9;
            const hasCert = !!(r.srcCertData || r.srcCertPath);
            return (
              <div
                key={r.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-5 hover:border-gray-300 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900 truncate">{r.name}</h3>
                    {!r.isActive && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">
                    TIN: {r.tin}{r.crn ? ` · CRN: ${r.crn}` : ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{r.address}</p>
                </div>

                <div className="shrink-0 hidden sm:flex flex-col items-end gap-1.5">
                  <div className="flex gap-1.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      hasCert ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {hasCert ? "Cert ✓" : "No cert"}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      complete ? "bg-emerald-100 text-emerald-700"
                      : step > 0 ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-500"
                    }`}>
                      {complete ? "Ready" : step > 0 ? `Step ${step}/9` : "New"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {r._count.receipts} receipts · {r._count.products} products
                  </p>
                </div>

                <div className="shrink-0 flex flex-col gap-1.5">
                  <Link
                    href={`/admin/restaurants/${r.id}`}
                    className="px-3.5 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-center font-medium"
                  >
                    Manage
                  </Link>
                  {step < 9 && (
                    <Link
                      href={`/admin/restaurants/${r.id}/onboarding`}
                      className="px-3.5 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
                    >
                      Onboarding →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
