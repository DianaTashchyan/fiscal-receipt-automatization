import Link from "next/link";
import ReceiptCreateForm from "./receipt-create-form";
import prisma from "@/lib/prisma/client";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export default async function NewReceiptPage() {
  const rawRestaurants = await prisma.restaurant.findMany({
    where:   { isActive: true },
    include: {
      departments: { where: { isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Only pass departments that are fully configured for fiscalization
  const restaurants = rawRestaurants.map((r) => ({
    ...r,
    departments: r.departments.filter(
      (d): d is typeof d & { taxDepartmentId: string; taxRegime: string } =>
        d.taxDepartmentId !== null && d.taxRegime !== null
    ),
  }));

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}>
      <div style={{ background: "linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)" }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            href="/receipts"
            className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Receipts
          </Link>
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Create</p>
          <h1 className="text-2xl font-bold text-white tracking-tight">New Fiscal Receipt</h1>
          <p className="text-sm text-slate-400 mt-1">Manually create and fiscalize a receipt through SRC.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <ReceiptCreateForm restaurants={restaurants} />
      </div>
    </div>
  );
}
