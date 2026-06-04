import { NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { runSrcStartupChecks } from "@/lib/src/startup-check";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, detail: "PostgreSQL reachable" };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : "DB unreachable" };
  }

  // SRC configuration
  try {
    const report = runSrcStartupChecks();
    checks.src = {
      ok: report.allPassed,
      detail: report.mode === "mock"
        ? "Mock mode active"
        : report.allPassed
          ? "Real mode — all checks passed"
          : `Real mode — ${report.checks.filter((c) => !c.ok).map((c) => c.check).join(", ")} failed`,
    };
  } catch {
    checks.src = { ok: false, detail: "Startup check threw" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
