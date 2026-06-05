import { notFound } from "next/navigation";
import prisma from "@/lib/prisma/client";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OnboardingPage({ params }: Props) {
  const { id } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: {
      id: true, name: true, tin: true, crn: true, address: true,
      platformName: true, websiteUrl: true,
      srcCsrPem: true, srcCsrCreatedAt: true,
      srcCertData: true, srcCertPath: true, srcConfiguredAt: true,
      srcOnboardingStep: true,
      cashiers:    { where: { isActive: true }, select: { id: true, name: true, taxCashierId: true, isDefault: true } },
      departments: { where: { isActive: true }, select: { id: true, name: true, taxDepartmentId: true, taxRegime: true } },
      apiKeys:     { where: { isActive: true }, select: { id: true, label: true } },
    },
  });

  if (!restaurant) notFound();

  const isMockMode = process.env.TAX_API_MODE !== "src_real";

  const data = {
    id: restaurant.id,
    name: restaurant.name,
    tin: restaurant.tin,
    crn: restaurant.crn ?? null,
    address: restaurant.address,
    platformName: restaurant.platformName ?? null,
    websiteUrl: restaurant.websiteUrl ?? null,
    outboundIp: process.env.OUTBOUND_IP ?? null,
    hasCsr: !!restaurant.srcCsrPem,
    csrCreatedAt: restaurant.srcCsrCreatedAt?.toISOString() ?? null,
    hasCert: !!(restaurant.srcCertData || restaurant.srcCertPath),
    certConfiguredAt: restaurant.srcConfiguredAt?.toISOString() ?? null,
    onboardingStep: restaurant.srcOnboardingStep ?? 0,
    cashiers: restaurant.cashiers,
    departments: restaurant.departments,
    hasApiKey: restaurant.apiKeys.length > 0,
    isMockMode,
  };

  return <OnboardingWizard restaurant={data} />;
}
