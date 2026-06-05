import Link from "next/link";
import prisma from "@/lib/prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LandingPage() {
  const [totalRestaurants, totalProducts, totalCashiers, totalReceipts, sentReceipts, failedReceipts] =
    await Promise.all([
      prisma.restaurant.count(),
      prisma.product.count(),
      prisma.cashier.count(),
      prisma.receipt.count(),
      prisma.receipt.count({ where: { sentAt: { not: null } } }),
      prisma.receipt.count({ where: { status: "FAILED" } }),
    ]);

  const features = [
    {
      color: "indigo",
      title: "SRC mTLS Fiscalization",
      description:
        "Each restaurant's certificate is stored as PKCS#12 and used for authenticated mTLS connections to the Armenian Tax Service — fully automatic.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    },
    {
      color: "blue",
      title: "PDF Receipts with QR Codes",
      description:
        "Every fiscalized receipt generates a clean PDF with fiscal number, QR code, cashier details, and itemized breakdown — instantly downloadable.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    {
      color: "violet",
      title: "REST API Integration",
      description:
        "A single POST request creates and fiscalizes a receipt. Authenticate with an API key from the dashboard. No SDK required — works with any POS or ordering platform.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
      ),
    },
    {
      color: "emerald",
      title: "Multi-Restaurant Management",
      description:
        "Manage any number of restaurants, each with its own SRC certificate, cashiers, departments, products, and tax regime configuration.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
        </svg>
      ),
    },
    {
      color: "amber",
      title: "Email & SMS Delivery",
      description:
        "Automatically deliver receipts to customers via email or SMS link after fiscalization. SMTP integration with configurable templates.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
    },
    {
      color: "rose",
      title: "Full Audit Trail",
      description:
        "Every receipt has a complete event timeline — creation, fiscalization, delivery. Re-print support and searchable receipt history always available.",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
  ];

  const iconBg: Record<string, string> = {
    indigo: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400",
    blue:   "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400",
    emerald:"bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
    amber:  "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400",
    rose:   "bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400",
  };

  const checkIcon = (
    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#030712] text-gray-900 dark:text-gray-100">

      {/* ── Sticky nav ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/90 dark:bg-[#030712]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight">FiscalReceipt</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            <Link href="/receipts" className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium">
              Receipts
            </Link>
            <Link href="/docs" className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium">
              Docs
            </Link>
            <Link
              href="/admin"
              className="ml-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              Admin Dashboard
            </Link>
          </nav>

          <Link href="/admin" className="sm:hidden px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl">
            Dashboard
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/80 via-white to-white dark:from-indigo-950/20 dark:via-[#030712] dark:to-[#030712] pt-20 pb-28">
        {/* Subtle dot grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, #6366f1 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300 text-sm font-semibold mb-8">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Armenian Tax Service (SRC) Compliant Platform
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-extrabold tracking-tight text-gray-900 dark:text-white mb-6 leading-[1.05]">
            Electronic Fiscal Receipts
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-400">
              Done Right.
            </span>
          </h1>

          <p className="text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Issue, fiscalize, and deliver SRC-compliant receipts via REST API or admin dashboard.
            Built for restaurants, delivery platforms, and POS systems operating in Armenia.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/25 text-base"
            >
              Open Admin Dashboard
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/receipts/new"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-xl transition-colors text-base"
            >
              Create a Receipt
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-7 py-3.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60 text-gray-600 dark:text-gray-300 font-medium rounded-xl transition-colors text-base"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              SRC Docs
            </Link>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-gray-400 dark:text-gray-500">
            {["mTLS certificate auth", "PDF + QR code receipts", "Email & SMS delivery", "API-key POS integration"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div className="border-y border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 text-center">
            {[
              { label: "Restaurants", value: totalRestaurants },
              { label: "Products",    value: totalProducts },
              { label: "Cashiers",    value: totalCashiers },
              { label: "Receipts",    value: totalReceipts },
              { label: "Delivered",   value: sentReceipts },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums">
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-white dark:bg-[#030712]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">
              Platform Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
              Everything you need for compliant receipts
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-4 max-w-xl mx-auto text-lg">
              From SRC certificate onboarding to real-time fiscalization and PDF delivery — the complete stack.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md dark:hover:shadow-indigo-900/20 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${iconBg[f.color]}`}>
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API showcase ─────────────────────────────────────────────────────── */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/40 border-y border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left: copy */}
            <div>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">
                Developer-First
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-5">
                Integrate in minutes
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed mb-6">
                One POST request creates and fiscalizes a receipt. Use your restaurant API key — no SDK, no dependencies.
              </p>
              <ul className="space-y-3">
                {[
                  "Authenticate with X-Api-Key header",
                  "Match products via your POS externalProductId",
                  "CASH · CARD · MIXED · ONLINE payment types",
                  "Optional email / SMS delivery on creation",
                  "Returns fiscal number + QR data immediately",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                    {checkIcon}
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-md shadow-indigo-500/20"
              >
                Read the full API docs
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>

            {/* Right: code block */}
            <div className="rounded-2xl overflow-hidden border border-gray-700 dark:border-gray-700/80 shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-800 border-b border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-xs text-gray-400 font-mono">POST /api/receipts</span>
              </div>
              <pre className="bg-gray-900 p-5 text-sm font-mono text-gray-100 overflow-x-auto leading-6 whitespace-pre">
{`fetch("/api/receipts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": "<restaurant-api-key>",
  },
  body: JSON.stringify({
    externalOrderId: "order-001",
    paymentMethod:   "CARD",
    deliveryMethod:  "EMAIL",
    customerEmail:   "user@example.com",
    items: [{
      externalProductId: "pizza-001",
      quantity:   1,
      unitPrice:  3500,
      totalPrice: 3500,
    }],
  }),
});

// Response:
// {
//   id: "...",
//   fiscalNumber: "...",
//   status: "FISCALIZED",
//   qrUrl: "https://..."
// }`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live stats grid ───────────────────────────────────────────────────── */}
      <section className="py-24 bg-white dark:bg-[#030712]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">
              Live Platform Data
            </p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Real numbers, right now
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-3">
              These stats are fetched live from the database on every page load.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Restaurants", value: totalRestaurants, accent: "indigo"  },
              { label: "Products",    value: totalProducts,    accent: "blue"    },
              { label: "Cashiers",    value: totalCashiers,    accent: "violet"  },
              { label: "Receipts",    value: totalReceipts,    accent: "emerald" },
              { label: "Delivered",   value: sentReceipts,     accent: "amber"   },
              { label: "Failed",      value: failedReceipts,   accent: "rose"    },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-center hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
              >
                <div className="text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums mb-1">
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-indigo-600 to-violet-700">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to issue your first fiscal receipt?
          </h2>
          <p className="text-indigo-200 text-lg mb-10 leading-relaxed">
            Onboard a restaurant, upload your SRC certificate, and start issuing
            compliant fiscal receipts in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/admin"
              className="px-7 py-3.5 bg-white hover:bg-gray-50 text-indigo-700 font-semibold rounded-xl transition-colors text-base shadow-xl shadow-indigo-900/30"
            >
              Open Admin Dashboard →
            </Link>
            <Link
              href="/docs"
              className="px-7 py-3.5 border border-white/30 hover:bg-white/10 text-white font-medium rounded-xl transition-colors text-base"
            >
              Read Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">FiscalReceipt</span>
            </div>

            <div className="flex items-center gap-6">
              <Link href="/admin"    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Admin</Link>
              <Link href="/receipts" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Receipts</Link>
              <Link href="/docs"     className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Docs</Link>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              © 2025 FiscalReceipt · Armenian SRC Compliant
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
