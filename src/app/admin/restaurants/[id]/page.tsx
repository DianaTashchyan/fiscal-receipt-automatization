import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma/client";
import DeleteRestaurantButton from "./delete-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function wizardStep(db: number): number {
  if (db <= 0) return 1;
  if (db <= 2) return db;
  if (db === 3) return 3;
  if (db === 4) return 4;
  if (db <= 9) return 5;
  if (db <= 11) return 6;
  return 7;
}

export default async function RestaurantDetailPage({ params }: Props) {
  const { id } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      cashiers:    { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      departments: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      apiKeys:     { orderBy: { createdAt: "desc" } },
      _count:      { select: { receipts: true } },
    },
  });

  if (!restaurant) notFound();

  const hasCert    = !!(restaurant.srcCertData || restaurant.srcCertPath);
  const step       = restaurant.srcOnboardingStep ?? 0;
  const complete   = step >= 12;
  const ws         = wizardStep(step);
  const activeKeys = restaurant.apiKeys.filter((k) => k.isActive);

  const health = [
    { label: "SRC Certificate",  ok: hasCert,                             detail: hasCert ? "Uploaded & stored" : "Not uploaded yet",          href: "onboarding" },
    { label: "Cashiers",         ok: restaurant.cashiers.length > 0,      detail: `${restaurant.cashiers.length} cashier${restaurant.cashiers.length !== 1 ? "s" : ""} configured`, href: "cashiers" },
    { label: "Tax Departments",  ok: restaurant.departments.length > 0,   detail: `${restaurant.departments.length} department${restaurant.departments.length !== 1 ? "s" : ""} configured`, href: "departments" },
    { label: "API Key",          ok: activeKeys.length > 0,               detail: `${activeKeys.length} active key${activeKeys.length !== 1 ? "s" : ""}`, href: "api-keys" },
  ];

  const onboardingSteps = [
    { label: "Company Info",  done: step >= 1 },
    { label: "CSR",           done: step >= 2 },
    { label: "SRC Register",  done: step >= 3 },
    { label: "Certificate",   done: step >= 5 },
    { label: "Configure",     done: step >= 9 },
    { label: "API Key",       done: step >= 11 },
    { label: "Done",          done: step >= 12 },
  ];

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)" }}>
        <div className="px-7 py-6">
          <Link
            href="/admin/restaurants"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Restaurants
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide"
                  style={{
                    background: complete ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)",
                    color: complete ? "#6ee7b7" : "#a5b4fc",
                    border: `1px solid ${complete ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
                  }}
                >
                  {complete ? "✓ Live" : `Step ${ws}/7`}
                </span>
                {!restaurant.isActive && (
                  <span className="px-2.5 py-1 bg-white/10 text-slate-400 rounded-full text-xs font-semibold border border-white/10">Inactive</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{restaurant.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                <span className="text-sm font-mono text-slate-400">TIN: {restaurant.tin}</span>
                {restaurant.crn
                  ? <span className="text-sm font-mono text-indigo-300">CRN: {restaurant.crn}</span>
                  : <span className="text-sm text-amber-400">CRN: pending SRC approval</span>
                }
              </div>
              {restaurant.address && <p className="text-sm text-slate-500 mt-1">{restaurant.address}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              {!complete && (
                <Link
                  href={`/admin/restaurants/${id}/onboarding`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Continue Setup
                </Link>
              )}
              <Link
                href="/receipts/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Receipt
              </Link>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: "Receipts",      value: restaurant._count.receipts,   href: "/receipts" },
              { label: "Cashiers",      value: restaurant.cashiers.length,   href: `cashiers` },
              { label: "API Keys",      value: activeKeys.length,            href: `api-keys` },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href.startsWith("/") ? s.href : `/admin/restaurants/${id}/${s.href}`}
                className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-3 transition-colors"
              >
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: health check + danger */}
        <div className="lg:col-span-2 space-y-5">
          {/* Configuration health */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Configuration Health</h2>
              <span className={`text-xs font-semibold ${health.every(h => h.ok) ? "text-emerald-600" : "text-amber-600"}`}>
                {health.filter(h => h.ok).length}/{health.length} ready
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {health.map((h) => (
                <div key={h.label} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${h.ok ? "bg-emerald-50" : "bg-red-50"}`}>
                      {h.ok ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{h.label}</p>
                      <p className="text-xs text-gray-400">{h.detail}</p>
                    </div>
                  </div>
                  <Link
                    href={`/admin/restaurants/${id}/${h.href}`}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    {h.ok ? "Manage" : "Configure"} →
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-red-700 mb-1">Danger Zone</h3>
            <p className="text-xs text-red-500 mb-3">Permanently remove this restaurant and all receipts, products, cashiers, and API keys.</p>
            <DeleteRestaurantButton id={id} name={restaurant.name} />
          </div>
        </div>

        {/* Right: onboarding progress */}
        <div className="space-y-5">
          {!complete ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Onboarding</h2>
                <Link href={`/admin/restaurants/${id}/onboarding`} className="text-xs font-semibold text-indigo-600 hover:underline">
                  Resume →
                </Link>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((onboardingSteps.filter(s => s.done).length / onboardingSteps.length) * 100)}%`,
                        background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 shrink-0">
                    {onboardingSteps.filter(s => s.done).length}/{onboardingSteps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {onboardingSteps.map((s, i) => (
                    <div key={s.label} className="flex items-center gap-2.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        s.done
                          ? "bg-emerald-100 text-emerald-600"
                          : i === onboardingSteps.findIndex(x => !x.done)
                            ? "ring-2 ring-indigo-500 bg-indigo-50 text-indigo-600"
                            : "bg-gray-100 text-gray-400"
                      }`}>
                        {s.done ? (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : i + 1}
                      </div>
                      <span className={`text-xs font-medium ${s.done ? "text-gray-400 line-through" : i === onboardingSteps.findIndex(x => !x.done) ? "text-gray-900 font-semibold" : "text-gray-400"}`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
              <div className="px-5 py-6 text-center">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-lg font-bold text-white">Fully Configured</p>
                <p className="text-sm text-emerald-200 mt-1">Ready to issue fiscal receipts</p>
              </div>
            </div>
          )}

          {/* Certificate status */}
          {!hasCert && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-amber-800 mb-1">No SRC certificate</p>
                  <p className="text-xs text-amber-700">Real fiscal receipts cannot be issued.{" "}
                    <Link href={`/admin/restaurants/${id}/onboarding`} className="font-bold underline">Complete onboarding →</Link>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
