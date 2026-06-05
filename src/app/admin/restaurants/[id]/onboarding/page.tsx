import { notFound } from "next/navigation";
import { promises as dns } from "dns";
import prisma from "@/lib/prisma/client";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

// Resolve all IPv4 A-records for the hostname in websiteUrl.
// Returns comma-separated IPs (e.g. "159.89.213.138" or "1.2.3.4, 5.6.7.8").
// Returns null on DNS failure or if no A records exist.
async function resolveWebsiteIp(websiteUrl: string): Promise<string | null> {
  try {
    const hostname = new URL(websiteUrl).hostname;
    if (!hostname) return null;
    const addresses = await dns.resolve4(hostname);
    if (!addresses || addresses.length === 0) return null;
    return addresses.join(", ");
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

export default async function OnboardingPage({ params }: Props) {
  const { id } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: {
      id: true, name: true, tin: true, crn: true, address: true,
      platformName: true, websiteUrl: true, srcIpAddress: true,
      srcCsrPem: true, srcCsrCreatedAt: true,
      srcCertData: true, srcCertPath: true, srcConfiguredAt: true,
      srcOnboardingStep: true,
      cashiers:    { where: { isActive: true }, select: { id: true, name: true, taxCashierId: true, isDefault: true } },
      departments: { where: { isActive: true }, select: { id: true, name: true, taxDepartmentId: true, taxRegime: true } },
      apiKeys:     { where: { isActive: true }, select: { id: true, label: true } },
    },
  });

  if (!restaurant) notFound();

  // Resolve IP from websiteUrl hostname and cache to DB.
  // Cleared automatically when websiteUrl is updated via PATCH.
  let ipAddress = restaurant.srcIpAddress ?? null;
  if (ipAddress === null && restaurant.websiteUrl) {
    ipAddress = await resolveWebsiteIp(restaurant.websiteUrl);
    if (ipAddress) {
      await prisma.restaurant.update({ where: { id }, data: { srcIpAddress: ipAddress } });
    }
  }

  const isMockMode = process.env.TAX_API_MODE !== "src_real";

  const data = {
    id: restaurant.id,
    name: restaurant.name,
    tin: restaurant.tin,
    crn: restaurant.crn ?? null,
    address: restaurant.address,
    platformName: restaurant.platformName ?? null,
    websiteUrl: restaurant.websiteUrl ?? null,
    outboundIp: ipAddress,
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
