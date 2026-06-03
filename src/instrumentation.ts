// ============================================================
// src/instrumentation.ts
// Next.js 13+ server instrumentation — runs once on startup,
// before any request is handled.
//
// We validate the SRC configuration here so that a misconfigured
// real-mode deployment fails immediately with a clear error rather
// than silently accepting orders that can never be fiscalized.
// ============================================================

export async function register() {
  // Only run server-side (not in the Edge runtime or during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runSrcStartupChecks } = await import("@/lib/src/startup-check");
    const report = runSrcStartupChecks();

    for (const check of report.checks) {
      const prefix = check.ok ? "✓" : "✗";
      const level = check.ok ? "info" : "error";
      console[level](`[SRC startup] ${prefix} ${check.check}: ${check.detail}`);
    }

    if (!report.allPassed) {
      const failures = report.checks.filter((c) => !c.ok);
      const lines = failures.map((f) => `  [FAIL] ${f.check}: ${f.detail}`).join("\n");
      // In production, abort startup. In development/mock, log a warning.
      if (process.env.NODE_ENV === "production" && report.mode === "src_real") {
        throw new Error(
          `[SRC] Configuration is incomplete. The server will not accept fiscal requests until these are resolved:\n${lines}`
        );
      } else {
        console.warn(`[SRC] Configuration warnings (non-fatal in ${process.env.NODE_ENV} / ${report.mode} mode):\n${lines}`);
      }
    }
  }
}
