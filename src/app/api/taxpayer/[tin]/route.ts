// GET /api/taxpayer/:tin
//
// Looks up company data from the Armenian Ministry of Justice e-register
// (e-register.moj.am). This is a free, publicly accessible government registry —
// no authentication, no API key, no cookies required.
//
// Two-step flow:
//   1. GET /en/search/companies?query={tin} → HTML → company name + internal ID
//   2. GET /en/companies/{id} → HTML → full company data (TIN, address, status, etc.)
//
// Falls back to mock data if the registry is unreachable, clearly labeled isMock=true.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { isValidTin } from "@/lib/src/validation";

type RouteContext = { params: Promise<{ tin: string }> };

export type TinLookupResult = {
  tin: string;
  name: string | null;
  address: string | null;
  status: string | null;
  registrationNumber: string | null;
  registrationDate: string | null;
  isMock: boolean;
  notFound?: boolean;
  error?: string;
};

const EREGISTER_BASE = "https://e-register.moj.am";
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; FiscalReceiptService/1.0)",
  "Accept": "text/html,application/xhtml+xml",
};
const TIMEOUT_MS = 10_000;

function decodeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseDetailFields(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, "").trim();
    const val = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (key && val) result[key] = val;
  }
  return result;
}

async function lookupFromERegister(tin: string): Promise<TinLookupResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Step 1: search
    const searchRes = await fetch(
      `${EREGISTER_BASE}/en/search/companies?query=${encodeURIComponent(tin)}`,
      { headers: FETCH_HEADERS, signal: controller.signal }
    );

    if (!searchRes.ok) {
      throw new Error(`e-register search returned HTTP ${searchRes.status}`);
    }

    const searchHtml = await searchRes.text();

    // Parse result count
    const countMatch = searchHtml.match(/Search results \((\d+)\)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;

    if (count === 0) {
      return { tin, name: null, address: null, status: null, registrationNumber: null, registrationDate: null, isMock: false, notFound: true };
    }

    // Parse first result: href="/en/companies/{id}" and company name in <h4>
    const linkMatch = searchHtml.match(
      /href="\/en\/companies\/(\d+)"[\s\S]*?<h4>([\s\S]*?)<\/h4>/
    );
    if (!linkMatch) {
      throw new Error("Could not parse search result HTML");
    }

    const internalId = linkMatch[1];
    const nameFromSearch = decodeHtml(linkMatch[2]);

    // Step 2: detail page
    const detailRes = await fetch(
      `${EREGISTER_BASE}/en/companies/${internalId}`,
      { headers: FETCH_HEADERS, signal: controller.signal }
    );

    if (!detailRes.ok) {
      // Return partial data from search only
      return { tin, name: nameFromSearch, address: null, status: null, registrationNumber: null, registrationDate: null, isMock: false };
    }

    const detailHtml = await detailRes.text();
    const fields = parseDetailFields(detailHtml);

    // Verify TIN matches what the registry says
    const registryTin = fields["Tax id"];
    if (registryTin && registryTin !== tin) {
      throw new Error(`TIN mismatch: searched ${tin} but registry returned ${registryTin}`);
    }

    return {
      tin,
      name: nameFromSearch || null,
      address: fields["Address"] ?? null,
      status: fields["Company Status"] ?? null,
      registrationNumber: fields["Registration number"] ?? null,
      registrationDate: fields["Registration date"] ?? null,
      isMock: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mockFallback(tin: string, reason: string): TinLookupResult {
  return {
    tin,
    name: `Company TIN ${tin}`,
    address: "Yerevan, Armenia",
    status: "active",
    registrationNumber: null,
    registrationDate: null,
    isMock: true,
    error: `Using mock data — e-register unavailable: ${reason}`,
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth(req);

    const { tin } = await params;

    if (!isValidTin(tin)) {
      return NextResponse.json({ error: "TIN must be exactly 8 digits" }, { status: 400 });
    }

    try {
      const result = await lookupFromERegister(tin);
      return NextResponse.json(result);
    } catch (lookupErr) {
      const msg = lookupErr instanceof Error ? lookupErr.message : "Unknown error";
      // Service unreachable or parse failure → return mock so the wizard stays usable
      return NextResponse.json(mockFallback(tin, msg));
    }
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[taxpayer-lookup]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
