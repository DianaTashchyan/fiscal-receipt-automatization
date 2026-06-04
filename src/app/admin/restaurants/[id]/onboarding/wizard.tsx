"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import type { AutoConfigStatus } from "@/app/api/restaurants/[id]/post-cert-configure/route";

type Cashier    = { id: string; name: string; taxCashierId: string; isDefault: boolean };
type Department = { id: string; name: string; taxDepartmentId: string; taxRegime: string };
type Product    = { id: string; name: string };

type RestaurantData = {
  id: string; name: string; tin: string; crn: string | null; address: string;
  hasCsr: boolean; csrCreatedAt: string | null;
  hasCert: boolean; certConfiguredAt: string | null;
  onboardingStep: number;
  cashiers: Cashier[];
  departments: Department[];
  products: Product[];
  hasApiKey: boolean;
  isMockMode: boolean;
};

// Steps — CRN (4), Department (7), ECR Activation (8), Cashier (9) are all automatic.
// The user interacts only with: TIN(1), CSR(2), SRC submit(3), cert upload(5), products(10), API key(11), test(12).
const STEPS = [
  { n: 1,  title: "Enter TIN",              icon: "🏢", hint: "Verify company data by TIN" },
  { n: 2,  title: "Generate CSR",           icon: "🔑", hint: "Create key pair and CSR" },
  { n: 3,  title: "Submit to SRC",          icon: "📤", hint: "Upload CSR + register IP in u6" },
  { n: 4,  title: "Upload Certificate",     icon: "🔒", hint: "Upload signed .crt — backend auto-configures everything" },
  { n: 5,  title: "Auto-Configuration",     icon: "⚙",  hint: "CRN · Department · Cashier · ECR — all automatic" },
  { n: 6,  title: "Add Products",           icon: "📦", hint: "Good codes + ADG codes required by SRC" },
  { n: 7,  title: "Generate API Key",       icon: "🗝",  hint: "POS integration key" },
  { n: 8,  title: "Test Receipt",           icon: "🧾", hint: "Print and verify" },
];

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };

async function api(url: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export default function OnboardingWizard({ restaurant: initial }: { restaurant: RestaurantData }) {
  const [restaurant, setRestaurant] = useState(initial);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Map old 12-step DB value to our 8-step wizard display
  function mapDbStepToWizard(dbStep: number): number {
    if (dbStep <= 0) return 1;
    if (dbStep <= 2) return dbStep;
    if (dbStep === 3) return 3;
    // DB steps 4-9 all map to wizard step 5 (auto-configure) or beyond
    if (dbStep <= 9) return 5;
    if (dbStep <= 10) return 6;
    if (dbStep <= 11) return 7;
    return 8;
  }

  const initialStep = mapDbStepToWizard(restaurant.onboardingStep >= 12 ? 12 : restaurant.onboardingStep + 1);
  const [step, setStep]     = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; message: string } | null>(null);

  const _clearResult = useCallback(() => setResult(null), []);

  async function advanceDbStep(n: number) {
    if (n <= restaurant.onboardingStep) return;
    const { status } = await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: n });
    if (status === 401) setSessionExpired(true);
    else setRestaurant((r) => ({ ...r, onboardingStep: n }));
  }

  async function callApi(url: string, method: string, body?: unknown): Promise<ApiResult> {
    const r = await api(url, method, body);
    if (r.status === 401) setSessionExpired(true);
    return r;
  }

  function goTo(n: number) {
    setStep(Math.max(1, Math.min(n, 8)));
    setResult(null);
  }

  function stepStatus(n: number): "completed" | "active" | "pending" {
    // Map wizard step to DB step for completion check
    const dbThreshold = [0, 2, 2, 3, 5, 9, 10, 11, 12][n] ?? 12;
    if (restaurant.onboardingStep >= dbThreshold) return "completed";
    if (step === n) return "active";
    return "pending";
  }

  // ── Auto-configure state (populated after cert upload) ─────────────────────
  const [autoConfig, setAutoConfig] = useState<AutoConfigStatus | null>(() => {
    // Pre-populate if restaurant already has data
    if (initial.crn && initial.departments.length > 0 && initial.cashiers.length > 0) {
      return {
        crn: initial.crn,
        crnSource: "database",
        crnError: null,
        department: initial.departments[0] ? {
          id: initial.departments[0].id,
          name: initial.departments[0].name,
          taxDepartmentId: initial.departments[0].taxDepartmentId,
          taxRegime: initial.departments[0].taxRegime,
        } : null,
        departmentError: null,
        cashier: initial.cashiers[0] ? {
          id: initial.cashiers[0].id,
          name: initial.cashiers[0].name,
          taxCashierId: initial.cashiers[0].taxCashierId,
        } : null,
        cashierError: null,
        connected: initial.onboardingStep >= 6,
        connectionError: null,
        activated: initial.onboardingStep >= 8,
        activationError: null,
        isMockMode: initial.isMockMode,
      };
    }
    return null;
  });
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);

  async function runAutoConfig() {
    setAutoConfigLoading(true);
    const r = await callApi(`/api/restaurants/${restaurant.id}/post-cert-configure`, "POST");
    setAutoConfigLoading(false);
    if (r.ok) {
      const ac = r.data as AutoConfigStatus;
      setAutoConfig(ac);
      if (ac.crn) {
        setRestaurant((prev) => ({ ...prev, crn: ac.crn }));
      }
      if (ac.department && restaurant.departments.length === 0) {
        setRestaurant((prev) => ({
          ...prev,
          departments: [{ id: ac.department!.id, name: ac.department!.name, taxDepartmentId: ac.department!.taxDepartmentId, taxRegime: ac.department!.taxRegime }],
        }));
      }
      if (ac.cashier && restaurant.cashiers.length === 0) {
        setRestaurant((prev) => ({
          ...prev,
          cashiers: [{ id: ac.cashier!.id, name: ac.cashier!.name, taxCashierId: ac.cashier!.taxCashierId, isDefault: true }],
        }));
      }
    } else {
      setAutoConfig(null);
      setResult({ ok: false, message: (r.data.error as string) ?? "Auto-configuration failed" });
    }
  }

  // ── Step 1: TIN lookup ──────────────────────────────────────────────────────
  const [tinInput, setTinInput] = useState(restaurant.tin);
  const [companyName, setCompanyName] = useState(restaurant.name);
  const [companyAddress, setCompanyAddress] = useState(restaurant.address);
  const [lookupLoading, setLookupLoading] = useState(false);
  type LookupMeta = { isMock: boolean; status: string | null; registrationNumber: string | null; registrationDate: string | null; notFound: boolean; warning: string | null };
  const [lookupMeta, setLookupMeta] = useState<LookupMeta | null>(null);
  const [tinError, setTinError] = useState("");

  async function doTinLookup() {
    const t = tinInput.trim();
    if (!/^\d{8}$/.test(t)) { setTinError("TIN must be exactly 8 digits."); return; }
    setLookupLoading(true); setTinError(""); setLookupMeta(null);
    const r = await callApi(`/api/taxpayer/${t}`, "GET");
    setLookupLoading(false);
    if (!r.ok) { setTinError((r.data.error as string) ?? "Lookup failed"); return; }
    const d = r.data as { name?: string | null; address?: string | null; status?: string | null; registrationNumber?: string | null; registrationDate?: string | null; isMock: boolean; notFound?: boolean; error?: string };
    if (d.notFound) { setTinError(`TIN ${t} not found in Armenian company register.`); return; }
    setLookupMeta({ isMock: d.isMock, status: d.status ?? null, registrationNumber: d.registrationNumber ?? null, registrationDate: d.registrationDate ?? null, notFound: false, warning: d.isMock ? (d.error ?? "Using mock data.") : null });
    if (d.name) setCompanyName(d.name);
    if (d.address) setCompanyAddress(d.address);
  }

  async function doSaveCompany() {
    if (!companyName.trim() || !companyAddress.trim()) { setResult({ ok: false, message: "Company name and address are required." }); return; }
    setLoading(true); setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}`, "PATCH", { tin: tinInput.trim(), name: companyName.trim(), address: companyAddress.trim() });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, tin: tinInput.trim(), name: companyName.trim(), address: companyAddress.trim() }));
      setResult({ ok: true, message: "Company data saved." });
      await advanceDbStep(1);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to save" });
    }
    setLoading(false);
  }

  // ── Step 2: CSR ─────────────────────────────────────────────────────────────
  const [csrPem, setCsrPem] = useState<string | null>(null);

  async function doGenerateCsr() {
    setLoading(true); setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/generate-csr`, "POST");
    if (r.ok) {
      setCsrPem(r.data.csrPem as string);
      setRestaurant((prev) => ({ ...prev, hasCsr: true }));
      setResult({ ok: true, message: "CSR generated. Download it and proceed to step 3." });
      await advanceDbStep(2);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to generate CSR" });
    }
    setLoading(false);
  }

  function downloadCsr() {
    const pem = csrPem ?? "";
    const blob = new Blob([pem], { type: "application/pkcs10" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${restaurant.tin}.csr`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsrFromServer() {
    const a = document.createElement("a");
    a.href = `/api/restaurants/${restaurant.id}/csr`;
    a.download = `${restaurant.tin}.csr`;
    a.click();
  }

  // ── Step 4: Upload certificate + auto-configure ─────────────────────────────
  const [certMode, setCertMode] = useState<"p12" | "crt">("crt");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [certError, setCertError] = useState("");

  async function doUploadP12() {
    setCertError("");
    if (!certFile) { setCertError("Select a .p12 or .pfx file."); return; }
    if (certFile.size > 1_048_576) { setCertError("File must be smaller than 1 MB."); return; }
    if (!certFile.name.match(/\.(p12|pfx)$/i)) { setCertError("File must be .p12 or .pfx."); return; }
    if (!certPassword.trim()) { setCertError("Certificate password is required."); return; }
    setLoading(true); setResult(null);
    const buf         = await certFile.arrayBuffer();
    const certBase64  = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const r = await callApi(`/api/restaurants/${restaurant.id}/src-config`, "POST", { certBase64, certPassword });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, hasCert: true }));
      await advanceDbStep(5);
      setResult({ ok: true, message: "Certificate uploaded. Running auto-configuration…" });
      await runAutoConfig();
      goTo(5);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Certificate upload failed." });
    }
    setLoading(false);
  }

  async function doUploadCrt() {
    setCertError("");
    if (!certFile) { setCertError("Select the signed .crt file from SRC."); return; }
    if (certFile.size > 1_048_576) { setCertError("File must be smaller than 1 MB."); return; }
    if (!certFile.name.match(/\.crt$/i)) { setCertError("File must be a .crt certificate."); return; }
    setLoading(true); setResult(null);
    const buf        = await certFile.arrayBuffer();
    const crtBase64  = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const r = await callApi(`/api/restaurants/${restaurant.id}/upload-crt`, "POST", { crtBase64 });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, hasCert: true }));
      await advanceDbStep(5);
      setResult({ ok: true, message: "Certificate stored. Running auto-configuration…" });
      await runAutoConfig();
      goTo(5);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Certificate conversion failed." });
    }
    setLoading(false);
  }

  // ── Step 6: Products ────────────────────────────────────────────────────────
  const [prodName, setProdName]         = useState("");
  const [prodGoodCode, setProdGoodCode] = useState("");
  const [prodAdgCode, setProdAdgCode]   = useState("");
  const [prodUnit, setProdUnit]         = useState("piece");
  const [prodPrice, setProdPrice]       = useState("");

  type GoodItem = { goodName: string; goodCode: string; price: number };
  const [goodList, setGoodList]         = useState<GoodItem[]>([]);
  const [goodListLoading, setGoodListLoading] = useState(false);
  const [goodListError, setGoodListError]     = useState("");

  async function doFetchGoodList() {
    setGoodListLoading(true); setGoodListError("");
    const r = await callApi("/api/src/get-good-list", "POST", {
      crn: restaurant.crn,
      tin: restaurant.tin,
      taxRegime: Number(restaurant.departments[0]?.taxRegime ?? 1),
      restaurantId: restaurant.id,
    });
    setGoodListLoading(false);
    if (r.ok) {
      type GoodListPayload = { result?: { result?: { goodLists?: Array<{ goods?: GoodItem[] }> } } };
      const lists = (r.data as GoodListPayload).result?.result?.goodLists ?? [];
      const goods = lists.flatMap((l) => l.goods ?? []);
      setGoodList(goods);
      if (goods.length === 0) setGoodListError("SRC returned an empty good list.");
    } else {
      setGoodListError((r.data.error as string) ?? "Failed to fetch good list from SRC.");
    }
  }

  function selectGoodCode(good: GoodItem) {
    setProdGoodCode(good.goodCode);
    const adg = good.goodCode.replace("-", "").slice(0, 4);
    setProdAdgCode(adg);
    if (!prodName) setProdName(good.goodName.slice(0, 50));
    if (!prodPrice && good.price > 0) setProdPrice(String(good.price));
  }

  const firstDeptId = useMemo(() => restaurant.departments[0]?.id ?? "", []); // eslint-disable-line react-hooks/exhaustive-deps
  const [prodDeptId, setProdDeptId] = useState(firstDeptId);

  async function doAddProduct() {
    if (!prodName || !prodGoodCode || !prodAdgCode || !prodPrice) {
      setResult({ ok: false, message: "Product name, good code, ADG code and price are required." });
      return;
    }
    const deptId = prodDeptId || restaurant.departments[0]?.id;
    if (!deptId) {
      setResult({ ok: false, message: "No department configured. Complete auto-configuration first." });
      return;
    }
    setLoading(true); setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/products`, "POST", {
      name: prodName, goodCode: prodGoodCode, adgCode: prodAdgCode,
      unit: prodUnit, price: Number(prodPrice), departmentId: deptId,
    });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, products: [...prev.products, { id: (r.data as { id: string }).id, name: prodName }] }));
      setResult({ ok: true, message: `Product "${prodName}" added.` });
      await advanceDbStep(10);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to add product." });
    }
    setLoading(false);
  }

  // ── Step 7: API Key ─────────────────────────────────────────────────────────
  const [apiKey, setApiKey]   = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  async function doGenerateApiKey() {
    setLoading(true); setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/api-keys`, "POST", { label: "POS Terminal" });
    if (r.ok) {
      setApiKey((r.data as { key: string }).key);
      setRestaurant((prev) => ({ ...prev, hasApiKey: true }));
      setResult({ ok: true, message: "API key generated — copy it now, it will not be shown again." });
      await advanceDbStep(11);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to generate API key." });
    }
    setLoading(false);
  }

  async function copyKey() {
    if (apiKey) { await navigator.clipboard.writeText(apiKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }
  }

  const isReallyComplete = (restaurant.hasCert && restaurant.cashiers.length > 0 && restaurant.departments.length > 0 && restaurant.products.length > 0 && restaurant.hasApiKey);

  // ─── SESSION EXPIRED ───────────────────────────────────────────────────────
  if (sessionExpired) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Session expired</h2>
          <p className="text-sm text-red-700 mb-4">Your login session has expired. Please log in again.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
            Reload page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/restaurants/${restaurant.id}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← {restaurant.name}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">SRC Onboarding Wizard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            TIN → CSR → Submit to SRC → Upload .crt → automatic backend configuration
          </p>
        </div>
        {restaurant.isMockMode && (
          <span className="shrink-0 mt-1 px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full tracking-wide uppercase">
            MOCK MODE
          </span>
        )}
      </div>

      {/* Step pills */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s) => {
          const status = stepStatus(s.n);
          return (
            <button key={s.n} onClick={() => goTo(s.n)} title={s.hint}
              className={`shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                status === "active" ? "bg-blue-600 text-white border-blue-600"
                : status === "completed" ? "bg-green-50 text-green-700 border-green-300"
                : "bg-gray-50 text-gray-400 border-gray-200"
              }`}>
              <span>{s.icon}</span>
              <span className="text-[10px]">{s.n}</span>
              {status === "completed" && <span className="text-[9px] text-green-600">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Step panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-0.5">
          Step {step}: {STEPS[step - 1].title}
        </h2>
        <p className="text-xs text-gray-400 mb-4">{STEPS[step - 1].hint}</p>

        {/* ── Step 1: TIN ── */}
        {step === 1 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Enter your TIN to look up company data from the Armenian company register.
            </p>
            <div className="flex gap-2 mb-2">
              <input value={tinInput} onChange={(e) => { setTinInput(e.target.value); setLookupMeta(null); setTinError(""); }}
                maxLength={8} placeholder="8-digit TIN"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={doTinLookup} disabled={lookupLoading || !/^\d{8}$/.test(tinInput.trim())}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                {lookupLoading ? "Looking up…" : "Lookup company"}
              </button>
            </div>
            {tinError && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 mb-3">{tinError}</div>}
            {lookupMeta && !lookupMeta.notFound && (
              <div className={`px-3 py-2 rounded-lg text-xs mb-3 border ${lookupMeta.isMock ? "bg-yellow-50 border-yellow-300 text-yellow-800" : "bg-green-50 border-green-300 text-green-800"}`}>
                {lookupMeta.isMock ? <><span className="font-mono font-bold">[MOCK]</span> {lookupMeta.warning}</> : "Company data loaded from e-register.moj.am."}
              </div>
            )}
            <div className="flex flex-col gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Company name</span>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Legal address</span>
                <input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <StepButton onClick={doSaveCompany} loading={loading} label="Save company data →" />
            </div>
            {result?.ok && <button onClick={() => goTo(2)} className="mt-3 text-sm text-blue-600 hover:underline block">Continue to step 2 →</button>}
          </div>
        )}

        {/* ── Step 2: CSR ── */}
        {step === 2 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Generate an RSA-2048 key pair and Certificate Signing Request (CSR). The private key is stored encrypted on the server.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-600 mb-3">
              CN={restaurant.tin} Tin, OU={restaurant.tin} Tin, O={restaurant.tin} Tin, L=Yerevan, ST=Yerevan, C=AM
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              <strong>Warning:</strong> Re-generating a CSR creates a new private key. Any previously uploaded certificate will stop working.
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2 flex-wrap">
              <StepButton onClick={doGenerateCsr} loading={loading} label={restaurant.hasCsr ? "Re-generate CSR" : "Generate CSR"} />
              {(csrPem || restaurant.hasCsr) && (
                <button onClick={csrPem ? downloadCsr : downloadCsrFromServer}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                  ⬇ Download CSR ({restaurant.tin}.csr)
                </button>
              )}
            </div>
            {restaurant.hasCsr && (
              <p className="text-xs text-gray-400 mt-2">
                CSR created: {restaurant.csrCreatedAt ? new Date(restaurant.csrCreatedAt).toLocaleString() : "—"}
              </p>
            )}
            {(csrPem || restaurant.hasCsr) && (
              <button onClick={() => goTo(3)} className="mt-4 text-sm text-blue-600 hover:underline block">
                CSR downloaded → Continue to step 3
              </button>
            )}
          </div>
        )}

        {/* ── Step 3: Submit to SRC ── */}
        {step === 3 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              This step is performed in the SRC taxpayer cabinet. Follow the instructions below.
            </p>
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 mb-4">
              <strong>Browser certificate required:</strong> The SRC cabinet requires a client certificate. Opening it without the certificate gives <code className="text-xs bg-amber-100 px-1 rounded">ERR_BAD_SSL_CLIENT_AUTH_CERT</code>.
            </div>
            <ol className="list-decimal list-inside flex flex-col gap-3 text-sm text-gray-700 mb-4">
              <li>Open the SRC taxpayer cabinet using the certificate or login method provided by SRC.</li>
              <li>Go to <strong>Reports → Application u6</strong> (ECR registration).</li>
              <li>In section <strong>5.2 &ldquo;IP address&rdquo;</strong>, enter your server&apos;s static outbound IP.</li>
              <li>In <strong>&ldquo;Certificate signing request&rdquo;</strong>, upload the <code className="bg-gray-100 px-1 rounded">{restaurant.tin}.csr</code> file from step 2.</li>
              <li>Submit the form. SRC will review (1–5 business days).</li>
              <li>After approval, SRC returns a signed <strong>.crt</strong> file. Continue to step 4.</li>
            </ol>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-4">
              After SRC approves your u6, the backend will automatically extract all configuration from the signed certificate. You will not need to manually enter CRN, department, or cashier data.
            </div>
            <div className="flex gap-2">
              <button onClick={() => goTo(2)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={() => { advanceDbStep(3); goTo(4); }} label="CSR submitted → Upload certificate (step 4)" />
            </div>
          </div>
        )}

        {/* ── Step 4: Upload .crt → triggers auto-configure ── */}
        {step === 4 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Upload the certificate file returned by SRC after u6 approval. The backend will automatically handle CRN, department, cashier, and ECR activation — no manual input required.
            </p>

            {restaurant.hasCert && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Certificate already configured ({restaurant.certConfiguredAt ? new Date(restaurant.certConfiguredAt).toLocaleDateString() : "—"}). You can replace it below.
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <button onClick={() => { setCertMode("crt"); setCertFile(null); setCertError(""); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${certMode === "crt" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"}`}>
                Upload signed .crt (recommended)
              </button>
              <button onClick={() => { setCertMode("p12"); setCertFile(null); setCertError(""); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${certMode === "p12" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"}`}>
                Upload .p12 directly
              </button>
            </div>

            {certMode === "crt" && (
              <div className="flex flex-col gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  The server combines the signed .crt with the private key generated in step 2 to create a .p12 internally. No password required.
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Signed .crt from SRC</span>
                  <input type="file" accept=".crt" onChange={(e) => { setCertFile(e.target.files?.[0] ?? null); setCertError(""); }}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
                </label>
              </div>
            )}

            {certMode === "p12" && (
              <div className="flex flex-col gap-3 mb-4">
                <p className="text-xs text-gray-500">
                  Combine the signed .crt with the private key into a .p12 locally:
                  <code className="block mt-1 bg-gray-100 p-2 rounded font-mono text-xs break-all">
                    openssl pkcs12 -export -in {restaurant.tin}.crt -inkey {restaurant.tin}.key.pem -out {restaurant.tin}.p12
                  </code>
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">.p12 / .pfx file</span>
                  <input type="file" accept=".p12,.pfx" onChange={(e) => { setCertFile(e.target.files?.[0] ?? null); setCertError(""); }}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Certificate password</span>
                  <input type="password" value={certPassword} onChange={(e) => { setCertPassword(e.target.value); setCertError(""); }}
                    placeholder="Password used when creating the .p12"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>
            )}

            {certError && <p className="text-sm text-red-600 mb-3">{certError}</p>}
            <ResultBanner result={result} />
            {(loading || autoConfigLoading) && (
              <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 animate-pulse">
                {loading ? "Uploading certificate…" : "Running auto-configuration (CRN · Department · Cashier · ECR)…"}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => goTo(3)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={certMode === "p12" ? doUploadP12 : doUploadCrt} loading={loading || autoConfigLoading}
                label={certMode === "crt" ? "Upload .crt & Auto-Configure" : "Upload .p12 & Auto-Configure"} />
            </div>
            {restaurant.hasCert && !loading && !autoConfigLoading && (
              <button onClick={() => { runAutoConfig().then(() => goTo(5)); }} className="mt-3 text-sm text-blue-600 hover:underline block">
                Re-run auto-configuration →
              </button>
            )}
          </div>
        )}

        {/* ── Step 5: Auto-Configuration Status ── */}
        {step === 5 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              After certificate upload, the backend automatically configures all SRC data. No manual input is needed for any of these values.
            </p>

            {autoConfigLoading && (
              <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 mb-4 animate-pulse">
                Running auto-configuration… This may take 10–30 seconds.
              </div>
            )}

            {!autoConfig && !autoConfigLoading && (
              <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 mb-4">
                Auto-configuration has not run yet.{" "}
                {restaurant.hasCert
                  ? <button onClick={() => runAutoConfig()} className="underline font-medium">Run it now →</button>
                  : "Upload your certificate in step 4 to trigger it."}
              </div>
            )}

            {autoConfig && (
              <div className="flex flex-col gap-3 mb-4">
                {/* CRN */}
                <AutoConfigRow
                  label="CRN (Cash Register Number)"
                  value={autoConfig.crn}
                  source={autoConfig.crnSource}
                  error={autoConfig.crnError}
                  isMock={autoConfig.isMockMode}
                />

                {/* Department */}
                <AutoConfigRow
                  label="Department"
                  value={autoConfig.department ? `dep ${autoConfig.department.taxDepartmentId} — ${autoConfig.department.name} — regime ${autoConfig.department.taxRegime}` : null}
                  source={autoConfig.department ? "database" : null}
                  error={autoConfig.departmentError}
                  isMock={false}
                />

                {/* Cashier */}
                <AutoConfigRow
                  label="Cashier"
                  value={autoConfig.cashier ? `${autoConfig.cashier.name} (Tax ID: ${autoConfig.cashier.taxCashierId})` : null}
                  source={autoConfig.cashier ? "database" : null}
                  error={autoConfig.cashierError}
                  isMock={false}
                />

                {/* Connection */}
                <AutoConfigRow
                  label="SRC Connection (mTLS)"
                  value={autoConfig.connected ? "Connected — certificate accepted by SRC" : null}
                  source={autoConfig.connected ? "database" : null}
                  error={autoConfig.connectionError}
                  isMock={autoConfig.isMockMode}
                />

                {/* Activation */}
                <AutoConfigRow
                  label="ECR Activation"
                  value={autoConfig.activated ? "ECR activated" : null}
                  source={autoConfig.activated ? "database" : null}
                  error={autoConfig.activationError}
                  isMock={autoConfig.isMockMode}
                />
              </div>
            )}

            {/* Cashier note — no endpoint to auto-fetch from SRC */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 mb-4">
              <strong>Why cashier ID is 1:</strong> The SRC VCR API has no getCashierList or getCashierInfo endpoint — cashier IDs cannot be fetched programmatically. SRC assigns ID&nbsp;1 to the first cashier registered during u6 approval. This default is used automatically.
            </div>

            {autoConfig?.crnError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 mb-4">
                <strong>CRN blocking error:</strong> {autoConfig.crnError}
              </div>
            )}

            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(4)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back to upload</button>
              {restaurant.hasCert && (
                <button onClick={() => runAutoConfig()} disabled={autoConfigLoading}
                  className="px-4 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                  {autoConfigLoading ? "Running…" : "Re-run auto-configure"}
                </button>
              )}
            </div>
            {autoConfig && !autoConfig.crnError && (
              <button onClick={() => goTo(6)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Configuration complete → Add products (step 6)
              </button>
            )}
          </div>
        )}

        {/* ── Step 6: Products ── */}
        {step === 6 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Add at least one product. Good code and ADG code are required by SRC for every fiscal receipt line.
              Fetch the code list from SRC to select instead of typing manually.
            </p>
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-medium text-gray-700">SRC product catalogue</span>
                <button onClick={doFetchGoodList} disabled={goodListLoading || !restaurant.crn}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {goodListLoading ? "Fetching…" : "Fetch good list from SRC"}
                </button>
              </div>
              {goodListError && <p className="text-xs text-amber-700">{goodListError}</p>}
              {goodList.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{goodList.length} items — select to auto-fill codes:</p>
                  <select size={Math.min(goodList.length, 5)}
                    onChange={(e) => { const g = goodList[Number(e.target.value)]; if (g) selectGoodCode(g); }}
                    className="w-full text-xs border border-gray-300 rounded p-1 font-mono" defaultValue="">
                    <option value="" disabled>— select a good —</option>
                    {goodList.map((g, i) => (
                      <option key={i} value={i}>{g.goodCode} — {g.goodName} ({g.price} AMD)</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {restaurant.products.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ {restaurant.products.length} product(s) already added.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-sm font-medium text-gray-700">Product name (max 50 chars)</span>
                <input value={prodName} onChange={(e) => setProdName(e.target.value)} maxLength={50}
                  placeholder="e.g. Margherita Pizza"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Good code <span className="text-red-500">*</span></span>
                <input value={prodGoodCode} onChange={(e) => setProdGoodCode(e.target.value)}
                  placeholder="e.g. 2106-90"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">ADG code <span className="text-red-500">*</span></span>
                <input value={prodAdgCode} onChange={(e) => setProdAdgCode(e.target.value)}
                  placeholder="e.g. 2106"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Unit</span>
                <input value={prodUnit} onChange={(e) => setProdUnit(e.target.value)}
                  placeholder="piece"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Price (AMD)</span>
                <input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="3500" type="number"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              {restaurant.departments.length > 0 && (
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="text-sm font-medium text-gray-700">Department</span>
                  <select value={prodDeptId} onChange={(e) => setProdDeptId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {restaurant.departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} (dep {d.taxDepartmentId})</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(5)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doAddProduct} loading={loading} label="Add product" />
              {restaurant.products.length > 0 && (
                <button onClick={() => goTo(7)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already added) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(7)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Product added → Generate API key (step 7)
              </button>
            )}
          </div>
        )}

        {/* ── Step 7: API Key ── */}
        {step === 7 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Generate an API key to connect your POS system. Copy it immediately — it is shown only once.
            </p>
            {restaurant.hasApiKey && !apiKey && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ At least one API key already exists for this restaurant.
              </div>
            )}
            <ResultBanner result={result} />
            {apiKey ? (
              <div className="mb-4">
                <div className="bg-gray-900 rounded-lg p-3 flex items-center gap-2 mb-2">
                  <code className="text-green-400 text-xs font-mono flex-1 break-all">{apiKey}</code>
                  <button onClick={copyKey} className="shrink-0 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600">
                    {keyCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-amber-600">Use as <code>X-Api-Key</code> header in POS API requests. Not shown again.</p>
              </div>
            ) : (
              <div className="flex gap-2 mb-4">
                <button onClick={() => goTo(6)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
                <StepButton onClick={doGenerateApiKey} loading={loading} label="Generate API key" />
              </div>
            )}
            {(apiKey || restaurant.hasApiKey) && (
              <button onClick={() => { advanceDbStep(11); goTo(8); }} className="text-sm text-blue-600 hover:underline block">
                API key ready → Finish (step 8)
              </button>
            )}
          </div>
        )}

        {/* ── Step 8: Complete ── */}
        {step === 8 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Print a test receipt to verify end-to-end fiscalization before going live.
            </p>
            <div className="mb-5 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Readiness checklist
              </div>
              {[
                { label: "Certificate uploaded",   ok: restaurant.hasCert,                fix: 4 },
                { label: "Auto-configuration run", ok: !!autoConfig && !autoConfig.crnError, fix: 5 },
                { label: "Products added",          ok: restaurant.products.length > 0,   fix: 6 },
                { label: "API key generated",       ok: restaurant.hasApiKey,              fix: 7 },
              ].map((item) => (
                <div key={item.label} className={`flex items-center justify-between px-4 py-2 text-sm border-b border-gray-100 last:border-0 ${item.ok ? "bg-white" : "bg-red-50"}`}>
                  <span className={item.ok ? "text-gray-700" : "text-red-700"}>
                    {item.ok ? "✓ " : "✗ "}{item.label}
                  </span>
                  {!item.ok && (
                    <button onClick={() => goTo(item.fix)} className="text-xs text-blue-600 hover:underline">
                      Go to step {item.fix}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-6">
              <Link href="/receipts/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Create test receipt →
              </Link>
              <Link href={`/admin/restaurants/${restaurant.id}`} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Restaurant dashboard
              </Link>
            </div>
            {isReallyComplete ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <div className="text-3xl mb-2">✓</div>
                <h3 className="font-semibold text-green-900 mb-1">Ready for live fiscalization</h3>
                <p className="text-sm text-green-700">
                  All required steps are complete.
                  {restaurant.isMockMode && " (MOCK MODE — set TAX_API_MODE=src_real and deploy with a static outbound IP for production.)"}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>Not yet complete.</strong> Finish all items in the checklist above before going live.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepButton({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
      {loading ? "Working…" : label}
    </button>
  );
}

function ResultBanner({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <div className={`mb-3 px-4 py-3 rounded-lg text-sm ${result.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
      {result.ok ? "✓ " : "✗ "}{result.message}
    </div>
  );
}

type CrnSource = "certificate" | "database" | "mock-auto" | null;

const SOURCE_LABELS: Record<NonNullable<CrnSource>, string> = {
  "certificate": "extracted from SRC certificate",
  "database":    "already on file",
  "mock-auto":   "auto-assigned (mock mode)",
};

function AutoConfigRow({ label, value, source, error, isMock }: {
  label: string;
  value: string | null;
  source: CrnSource | string | null;
  error: string | null;
  isMock: boolean;
}) {
  if (error) {
    return (
      <div className="flex gap-3 items-start px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
        <span className="text-red-500 text-base leading-5 shrink-0">✗</span>
        <div>
          <div className="text-sm font-medium text-red-800">{label}</div>
          <div className="text-xs text-red-600 mt-0.5">{error}</div>
        </div>
      </div>
    );
  }
  if (value) {
    const srcLabel = source && SOURCE_LABELS[source as NonNullable<CrnSource>];
    return (
      <div className="flex gap-3 items-start px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
        <span className="text-green-600 text-base leading-5 shrink-0">✓</span>
        <div>
          <div className="text-sm font-medium text-green-800">{label}</div>
          <div className="text-xs text-green-700 mt-0.5 font-mono">{value}</div>
          {srcLabel && (
            <div className="text-xs text-green-600 mt-0.5">
              {srcLabel}{isMock && source === "mock-auto" ? " — real SRC call not attempted" : ""}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 items-start px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
      <span className="text-gray-400 text-base leading-5 shrink-0">—</span>
      <div>
        <div className="text-sm font-medium text-gray-500">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">Not yet configured</div>
      </div>
    </div>
  );
}
