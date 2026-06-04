import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma/client";

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

  const hasCert = !!(restaurant.srcCertData || restaurant.srcCertPath);
  const step = restaurant.srcOnboardingStep ?? 0;

  const tabs = [
    { label: "Cashiers",    href: `/admin/restaurants/${id}/cashiers`,    count: restaurant.cashiers.length },
    { label: "Departments", href: `/admin/restaurants/${id}/departments`,  count: restaurant.departments.length },
    { label: "Products",    href: `/admin/restaurants/${id}/products`,     count: restaurant.products.length },
    { label: "API Keys",    href: `/admin/restaurants/${id}/api-keys`,     count: restaurant.apiKeys.length },
  ];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/restaurants" className="text-sm text-gray-500 hover:text-gray-700">← Restaurants</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{restaurant.name}</h1>
          <p className="text-sm text-gray-500">TIN: {restaurant.tin} · CRN: {restaurant.crn}</p>
        </div>
        {step < 9 && (
          <Link href={`/admin/restaurants/${id}/onboarding`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Continue Onboarding (Step {step}/9)
          </Link>
        )}
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatusCard label="Onboarding" ok={step >= 9} text={step >= 9 ? "Complete" : `Step ${step}/9`} />
        <StatusCard label="Certificate" ok={hasCert} text={hasCert ? "Uploaded" : "Missing"} />
        <StatusCard label="Cashiers" ok={restaurant.cashiers.length > 0} text={`${restaurant.cashiers.length} active`} />
        <StatusCard label="Departments" ok={restaurant.departments.length > 0} text={`${restaurant.departments.length} active`} />
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href}
            className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-blue-300 transition-colors">
            <div className="text-xl font-bold text-gray-900">{t.count}</div>
            <div className="text-sm text-gray-500">{t.label}</div>
          </Link>
        ))}
      </div>

      {/* Receipt count */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex justify-between items-center">
        <div>
          <div className="font-semibold text-gray-900">{restaurant._count.receipts} Receipts</div>
          <div className="text-sm text-gray-500">Total fiscal receipts issued</div>
        </div>
        <Link href="/receipts" className="text-sm text-blue-600 hover:underline">View all →</Link>
      </div>

      {/* Cert source */}
      {hasCert && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          ✓ Certificate stored in {restaurant.srcCertData ? "database" : "filesystem"}.
          Configured {restaurant.srcConfiguredAt?.toLocaleDateString() ?? "—"}.
        </div>
      )}
      {!hasCert && (
        <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-800">
          ⚠ No certificate configured. Real fiscalization will fail.{" "}
          <Link href={`/admin/restaurants/${id}/onboarding`} className="underline font-medium">
            Complete onboarding →
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className={`rounded-xl border p-4 ${ok ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
      <div className={`text-xs font-medium mb-1 ${ok ? "text-green-600" : "text-orange-600"}`}>{label}</div>
      <div className={`text-sm font-semibold ${ok ? "text-green-800" : "text-orange-800"}`}>
        {ok ? "✓ " : "✗ "}{text}
      </div>
    </div>
  );
}
