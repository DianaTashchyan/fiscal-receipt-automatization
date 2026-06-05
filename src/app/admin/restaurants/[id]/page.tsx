import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma/client";
import DeleteRestaurantButton from "./delete-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RestaurantDetailPage({ params }: Props) {
  const { id } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      cashiers:    { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      departments: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      products:    { where: { isActive: true }, orderBy: { createdAt: "asc" }, take: 20 },
      apiKeys:     { orderBy: { createdAt: "desc" } },
      _count:      { select: { receipts: true } },
    },
  });

  if (!restaurant) notFound();

  const hasCert   = !!(restaurant.srcCertData || restaurant.srcCertPath);
  const step      = restaurant.srcOnboardingStep ?? 0;
  const complete  = step >= 9;
  const activeKeys = restaurant.apiKeys.filter((k) => k.isActive);

  const health = [
    { label: "Certificate",  ok: hasCert,                              detail: hasCert ? "Uploaded" : "Missing",                    href: `onboarding` },
    { label: "Cashiers",     ok: restaurant.cashiers.length > 0,       detail: `${restaurant.cashiers.length} configured`,          href: `cashiers` },
    { label: "Departments",  ok: restaurant.departments.length > 0,    detail: `${restaurant.departments.length} configured`,       href: `departments` },
    { label: "Products",     ok: restaurant.products.length > 0,       detail: `${restaurant.products.length} active`,              href: `products` },
    { label: "API Key",      ok: activeKeys.length > 0,                detail: `${activeKeys.length} active`,                      href: `api-keys` },
  ];

  const onboardingSteps = [
    { label: "Company Info",   done: step >= 1 },
    { label: "CSR",            done: step >= 2 },
    { label: "SRC Register",   done: step >= 3 },
    { label: "Certificate",    done: step >= 5 },
    { label: "Configuration",  done: step >= 9 },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <Link
          href="/admin/restaurants"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Restaurants
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{restaurant.name}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                {complete ? (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Live
                  </>
                ) : `Step ${step}/9`}
              </span>
              {!restaurant.isActive && (
                <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-semibold">Inactive</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
              <span className="font-mono">TIN: {restaurant.tin}</span>
              {restaurant.crn ? (
                <span className="font-mono">CRN: {restaurant.crn}</span>
              ) : (
                <span className="text-amber-600 font-medium">CRN: pending SRC approval</span>
              )}
            </div>
            {restaurant.address && (
              <p className="text-sm text-gray-400 mt-0.5">{restaurant.address}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!complete && (
              <Link
                href={`/admin/restaurants/${id}/onboarding`}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                Continue Setup
              </Link>
            )}
            <Link
              href={`/receipts/new`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Create Receipt
            </Link>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Receipts",    value: restaurant._count.receipts,   href: "/receipts" },
          { label: "Products",    value: restaurant.products.length,    href: `products` },
          { label: "Cashiers",    value: restaurant.cashiers.length,    href: `cashiers` },
          { label: "API Keys",    value: activeKeys.length,             href: `api-keys` },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href.startsWith("/") ? s.href : `/admin/restaurants/${id}/${s.href}`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <div className="text-2xl font-bold text-gray-900 mb-0.5">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Onboarding progress */}
      {!complete && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Onboarding Progress</h2>
            <Link
              href={`/admin/restaurants/${id}/onboarding`}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              Resume →
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {onboardingSteps.map((s, i) => (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    s.done ? "bg-emerald-500 text-white" : i === onboardingSteps.findIndex((x) => !x.done) ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-gray-100 text-gray-400"
                  }`}>
                    {s.done ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 text-center leading-tight hidden sm:block">{s.label}</span>
                </div>
                {i < onboardingSteps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 sm:mb-5 ${s.done ? "bg-emerald-300" : "bg-gray-100"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health check grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Configuration Health</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {health.map((h) => (
            <div key={h.label} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${h.ok ? "bg-emerald-100" : "bg-red-100"}`}>
                  {h.ok ? (
                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{h.label}</p>
                  <p className="text-xs text-gray-500">{h.detail}</p>
                </div>
              </div>
              <Link
                href={`/admin/restaurants/${id}/${h.href}`}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                {h.ok ? "Manage" : "Configure"} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Certificate status banner */}
      {!hasCert && (
        <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-6">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>
            <strong>No SRC certificate configured.</strong> Real fiscal receipts cannot be issued until you upload a signed certificate from SRC.{" "}
            <Link href={`/admin/restaurants/${id}/onboarding`} className="font-semibold underline">
              Complete onboarding →
            </Link>
          </span>
        </div>
      )}

      {/* Danger zone */}
      <div className="border border-red-200 rounded-xl p-5 bg-red-50/40">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h3>
        <p className="text-xs text-red-500 mb-3">
          Permanently remove this restaurant and all associated receipts, products, cashiers, and API keys.
        </p>
        <DeleteRestaurantButton id={id} name={restaurant.name} />
      </div>
    </div>
  );
}
