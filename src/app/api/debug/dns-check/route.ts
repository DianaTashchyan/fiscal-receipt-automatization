import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import prisma from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

// One-time verification token — delete this endpoint after confirming production DNS.
const DEBUG_TOKEN = "glana-dns-verify-2025";

async function resolveWith8888(hostname: string): Promise<string[] | string> {
  try {
    const resolver = new dns.Resolver();
    resolver.setServers(["8.8.8.8"]);
    return await resolver.resolve4(hostname);
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function resolveWithSystem(hostname: string): Promise<string[] | string> {
  try {
    return await dns.resolve4(hostname);
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function resolveViaDoH(hostname: string): Promise<string[] | string> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return `HTTP ${res.status}`;
    const json = await res.json() as { Answer?: { type: number; data: string }[] };
    const a = (json.Answer ?? []).filter((r) => r.type === 1).map((r) => r.data);
    return a.length ? a : "no A records";
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("token") !== DEBUG_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { websiteUrl: { not: null } },
    select: { id: true, name: true, websiteUrl: true, srcIpAddress: true },
    take: 5,
  });

  const results = await Promise.all(
    restaurants.map(async (r) => {
      const websiteUrl = r.websiteUrl!;
      let hostname: string | null = null;
      try { hostname = new URL(websiteUrl).hostname; } catch { /* ignore */ }

      const [systemDns, googleDns, dohDns] = hostname
        ? await Promise.all([
            resolveWithSystem(hostname),
            resolveWith8888(hostname),
            resolveViaDoH(hostname),
          ])
        : ["no hostname", "no hostname", "no hostname"];

      const step3PrimaryIp = r.srcIpAddress
        ? r.srcIpAddress.split(",")[0].trim()
        : Array.isArray(systemDns) ? systemDns[0] ?? null : null;

      return {
        restaurantId: r.id,
        restaurantName: r.name,
        websiteUrl,
        hostname,
        resolution: {
          system_resolver: systemDns,
          google_8888: googleDns,
          google_doh_api: dohDns,
        },
        srcIpAddress_in_db: r.srcIpAddress,
        step3_primary_ip_shown: step3PrimaryIp,
      };
    })
  );

  return NextResponse.json({
    server: "production",
    timestamp: new Date().toISOString(),
    results,
  });
}
