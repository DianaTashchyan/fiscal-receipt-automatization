import ReceiptCreateForm from "./receipt-create-form";
import prisma from "@/lib/prisma/client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewReceiptPage() {
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    include: {
      cashiers: {
        where: { isActive: true },
      },
      products: {
        where: { isActive: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Create Receipt</h1>
      <ReceiptCreateForm restaurants={restaurants} />
    </main>
  );
}