import Link from "next/link";
import ReceiptCreateForm from "./receipt-create-form";
import prisma from "@/lib/prisma/client";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

export default async function NewReceiptPage() {
  const restaurants = await prisma.restaurant.findMany({
    where:   { isActive: true },
    include: {
      cashiers: { where: { isActive: true } },
      products: { where: { isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/receipts"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Receipts
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Receipt</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manually create a fiscal receipt. The receipt will be fiscalized with the SRC immediately.
          </p>
        </div>

        <ReceiptCreateForm restaurants={restaurants} />
      </div>
    </div>
  );
}
