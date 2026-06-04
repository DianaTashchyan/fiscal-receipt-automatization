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
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Restaurants</h1>
          <p className="text-gray-500 text-sm mt-0.5">{restaurants.length} registered</p>
        </div>
        <Link href="/admin/restaurants/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + New Restaurant
        </Link>
      </div>

      {restaurants.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-500 mb-4">No restaurants yet.</p>
          <Link href="/admin/restaurants/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
            Onboard your first restaurant
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {restaurants.map((r) => {
            const step = r.srcOnboardingStep ?? 0;
            const complete = step >= 9;
            const hasCert = !!(r.srcCertData || r.srcCertPath);
            return (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900 truncate">{r.name}</h3>
                    {!r.isActive && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">TIN: {r.tin} · CRN: {r.crn}</p>
                  <p className="text-xs text-gray-400 mt-1">{r.address}</p>
                </div>
                <div className="shrink-0 text-center">
                  <div className="flex gap-2 text-xs text-gray-500 mb-1">
                    <span>{r._count.receipts} receipts</span>
                    <span>{r._count.products} products</span>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      hasCert ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {hasCert ? "Cert ✓" : "No cert"}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      complete ? "bg-green-100 text-green-700"
                      : step > 0 ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-500"
                    }`}>
                      {complete ? "Ready" : step > 0 ? `Step ${step}/9` : "New"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-1">
                  <Link href={`/admin/restaurants/${r.id}`}
                    className="px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-center">
                    Manage
                  </Link>
                  {step < 9 && (
                    <Link href={`/admin/restaurants/${r.id}/onboarding`}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center">
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
