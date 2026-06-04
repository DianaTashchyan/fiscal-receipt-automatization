"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";

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

// Steps matching boss requirements (E):
// 1=Enter TIN, 2=Generate CSR, 3=Submit to SRC, 4=Enter CRN,
// 5=Upload Certificate, 6=Test Connection, 7=Configure Departments,
// 8=Activate ECR, 9=Add Cashier, 10=Add Products, 11=Generate API Key, 12=Print Test Receipt
const STEPS = [
  { n: 1,  title: "Enter TIN",              icon: "🏢", hint: "Verify company data by TIN" },
  { n: 2,  title: "Generate CSR",           icon: "🔑", hint: "Create key pair and CSR" },
  { n: 3,  title: "Submit to SRC",          icon: "📤", hint: "Upload CSR + register IP" },
  { n: 4,  title: "Enter CRN",              icon: "🔢", hint: "Cash register number from SRC" },
  { n: 5,  title: "Upload Certificate",     icon: "🔒", hint: ".p12 or signed .crt" },
  { n: 6,  title: "Test Connection",        icon: "🔌", hint: "Verify mTLS to SRC" },
  { n: 7,  title: "Configure Departments",  icon: "🏷",  hint: "Tax departments + SRC sync" },
  { n: 8,  title: "Activate ECR",           icon: "⚡", hint: "One-time ECR activation" },
  { n: 9,  title: "Add Cashier",            icon: "👤", hint: "Cashier from SRC cabinet" },
  { n: 10, title: "Add Products",           icon: "📦", hint: "Good codes + ADG codes" },
  { n: 11, title: "Generate API Key",       icon: "🗝",  hint: "POS integration key" },
  { n: 12, title: "Test Receipt",           icon: "🧾", hint: "Print and verify" },
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

  // If session expires (401), show a prominent auth error instead of silent failure.
  const [sessionExpired, setSessionExpired] = useState(false);

  const clampStep = (s: number) => Math.max(1, Math.min(s, 12));
  const initialStep = restaurant.onboardingStep >= 12 ? 12 : clampStep(restaurant.onboardingStep + 1);
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const _clearResult = useCallback(() => setResult(null), []);

  // Advance the tracked onboarding step in DB if we reached a new milestone.
  async function advanceStep(n: number) {
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
    setStep(clampStep(n));
    setResult(null);
  }

  // Step status: completed if onboardingStep >= n, active if step===n, pending otherwise
  function stepStatus(n: number): "completed" | "active" | "waiting" | "pending" {
    if (restaurant.onboardingStep >= n) return "completed";
    if (step === n) return "active";
    // Steps 3 and 4 require external human action — show "waiting" while onboardingStep < n
    if ((n === 3 || n === 4) && restaurant.onboardingStep >= n - 1) return "waiting";
    return "pending";
  }

  // ---- Step 1: TIN lookup + company save ----
  const [tinInput, setTinInput] = useState(restaurant.tin);
  const [companyName, setCompanyName] = useState(restaurant.name);
  const [companyAddress, setCompanyAddress] = useState(restaurant.address);
  const [lookupLoading, setLookupLoading] = useState(false);
  type LookupMeta = {
    isMock: boolean;
    status: string | null;
    registrationNumber: string | null;
    registrationDate: string | null;
    notFound: boolean;
    warning: string | null;
  };
  const [lookupMeta, setLookupMeta] = useState<LookupMeta | null>(null);
  const [tinError, setTinError] = useState("");

  async function doTinLookup() {
    const t = tinInput.trim();
    if (!/^\d{8}$/.test(t)) { setTinError("TIN must be exactly 8 digits."); return; }
    setLookupLoading(true);
    setTinError("");
    setLookupMeta(null);
    const r = await callApi(`/api/taxpayer/${t}`, "GET");
    setLookupLoading(false);
    if (!r.ok) { setTinError((r.data.error as string) ?? "Lookup failed"); return; }
    const d = r.data as {
      name?: string | null; address?: string | null; status?: string | null;
      registrationNumber?: string | null; registrationDate?: string | null;
      isMock: boolean; notFound?: boolean; error?: string;
    };
    if (d.notFound) {
      setTinError(`TIN ${t} was not found in the Armenian company register. Check the TIN and try again.`);
      setLookupLoading(false);
      return;
    }
    setLookupMeta({
      isMock: d.isMock,
      status: d.status ?? null,
      registrationNumber: d.registrationNumber ?? null,
      registrationDate: d.registrationDate ?? null,
      notFound: false,
      warning: d.isMock ? (d.error ?? "Using mock data — e-register lookup unavailable.") : null,
    });
    if (d.name) setCompanyName(d.name);
    if (d.address) setCompanyAddress(d.address);
  }

  async function doSaveCompany() {
    if (!companyName.trim() || !companyAddress.trim()) {
      setResult({ ok: false, message: "Company name and address are required." });
      return;
    }
    setLoading(true);
    setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}`, "PATCH", {
      tin: tinInput.trim(), name: companyName.trim(), address: companyAddress.trim(),
    });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, tin: tinInput.trim(), name: companyName.trim(), address: companyAddress.trim() }));
      setResult({ ok: true, message: "Company data saved." });
      await advanceStep(1);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to save" });
    }
    setLoading(false);
  }

  // ---- Step 2: CSR generation ----
  const [csrPem, setCsrPem] = useState<string | null>(null);

  async function doGenerateCsr() {
    setLoading(true);
    setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/generate-csr`, "POST");
    if (r.ok) {
      setCsrPem(r.data.csrPem as string);
      setRestaurant((prev) => ({ ...prev, hasCsr: true }));
      setResult({ ok: true, message: "CSR generated. Download it below, then proceed to step 3." });
      await advanceStep(2);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to generate CSR" });
    }
    setLoading(false);
  }

  function downloadCsr() {
    const pem = csrPem ?? "";
    const blob = new Blob([pem], { type: "application/pkcs10" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${restaurant.tin}.csr`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsrFromServer() {
    const a = document.createElement("a");
    a.href = `/api/restaurants/${restaurant.id}/csr`;
    a.download = `${restaurant.tin}.csr`;
    a.click();
  }

  // ---- Step 4: Enter CRN ----
  const [crnInput, setCrnInput] = useState(restaurant.crn ?? "");

  async function doSaveCrn() {
    if (!crnInput.trim()) { setResult({ ok: false, message: "CRN is required." }); return; }
    setLoading(true);
    setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}`, "PATCH", { crn: crnInput.trim() });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, crn: crnInput.trim() }));
      setResult({ ok: true, message: `CRN "${crnInput.trim()}" saved.` });
      await advanceStep(4);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to save CRN" });
    }
    setLoading(false);
  }

  // ---- Step 5: Upload certificate ----
  const [certMode, setCertMode] = useState<"p12" | "crt">("p12");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [certError, setCertError] = useState("");

  async function doUploadP12() {
    setCertError("");
    if (!certFile) { setCertError("Select a .p12 or .pfx file."); return; }
    if (certFile.size > 1_048_576) { setCertError("File must be smaller than 1 MB."); return; }
    if (!certFile.name.match(/\.(p12|pfx)$/i)) { setCertError("File must be .p12 or .pfx."); return; }
    if (!certPassword.trim()) { setCertError("Certificate password is required."); return; }

    setLoading(true);
    setResult(null);
    const buf = await certFile.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const r = await callApi(`/api/restaurants/${restaurant.id}/src-config`, "POST", { certBase64, certPassword });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, hasCert: true }));
      setResult({ ok: true, message: "Certificate uploaded and validated." });
      await advanceStep(5);
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

    setLoading(true);
    setResult(null);
    const buf = await certFile.arrayBuffer();
    const crtBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const r = await callApi(`/api/restaurants/${restaurant.id}/upload-crt`, "POST", { crtBase64 });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, hasCert: true }));
      setResult({ ok: true, message: "Signed .crt converted to .p12 server-side and stored securely." });
      await advanceStep(5);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Certificate conversion failed." });
    }
    setLoading(false);
  }

  // ---- Step 6: Test connection ----
  async function doTestConnection() {
    if (!restaurant.crn) {
      setResult({ ok: false, message: "CRN is missing — complete step 4 first." });
      return;
    }
    setLoading(true);
    setResult(null);
    const r = await callApi("/api/src/check-connection", "POST", {
      crn: restaurant.crn, restaurantId: restaurant.id,
    });
    if (r.ok && (r.data.result as Record<string, unknown>)?.code === 0) {
      setResult({ ok: true, message: "Connection successful — SRC is reachable and certificate accepted." });
      await advanceStep(6);
    } else {
      const msg = (r.data.error as string) ?? ((r.data.result as Record<string, unknown>)?.message as string) ?? "Connection failed";
      setResult({ ok: false, message: msg });
    }
    setLoading(false);
  }

  // ---- Step 7: Configure departments ----
  // dept number is always 1 (standard ECR single department); name is always "Main".
  // Only the tax regime varies by business type — that is the sole user choice.
  const [deptRegime, setDeptRegime] = useState("1");

  async function doConfigureDepts() {
    setLoading(true);
    setResult(null);
    const dbR = await callApi(`/api/restaurants/${restaurant.id}/departments`, "POST", {
      name: "Main", taxDepartmentId: "1", taxRegime: Number(deptRegime), isDefault: true,
    });
    if (!dbR.ok) {
      setResult({ ok: false, message: (dbR.data.error as string) ?? "Failed to save department." });
      setLoading(false);
      return;
    }
    const srcR = await callApi("/api/src/configure-departments", "POST", {
      crn: restaurant.crn, restaurantId: restaurant.id,
      departments: [{ dep: 1, taxRegime: Number(deptRegime) }],
    });
    if (srcR.ok) {
      setRestaurant((prev) => ({
        ...prev,
        departments: [...prev.departments, {
          id: (dbR.data as { id: string }).id ?? "",
          name: "Main", taxDepartmentId: "1", taxRegime: deptRegime,
        }],
      }));
      setResult({ ok: true, message: "Department (dep 1) configured and synced to SRC." });
      await advanceStep(7);
    } else {
      setResult({ ok: false, message: `Saved to DB but SRC sync failed: ${(srcR.data.error as string) ?? "unknown error"}` });
    }
    setLoading(false);
  }

  // ---- Step 8: Activate ECR ----
  async function doActivate() {
    setLoading(true);
    setResult(null);
    const r = await callApi("/api/src/activate", "POST", { crn: restaurant.crn, restaurantId: restaurant.id });
    if (r.ok) {
      setResult({ ok: true, message: "ECR activated successfully." });
      await advanceStep(8);
    } else {
      const msg = (r.data.error as string) ?? "Activation failed";
      setResult({ ok: false, message: msg });
    }
    setLoading(false);
  }

  // ---- Step 9: Add cashier ----
  // Name ("Main Cashier") and PIN (random) are local/internal fields — only taxCashierId
  // comes from SRC (u6 cabinet → Cashiers section) and cannot be auto-fetched.
  const [cashierTaxId, setCashierTaxId] = useState("");

  async function doAddCashier() {
    if (!cashierTaxId.trim()) {
      setResult({ ok: false, message: "Tax Cashier ID is required — find it in the SRC cabinet (u6 → Cashiers)." });
      return;
    }
    setLoading(true);
    setResult(null);
    // PIN is a local access code only — auto-generate a random 4-digit value.
    const autoPin = String(Math.floor(1000 + Math.random() * 9000));
    const r = await callApi(`/api/restaurants/${restaurant.id}/cashiers`, "POST", {
      name: "Main Cashier", taxCashierId: cashierTaxId.trim(), pinCode: autoPin, isDefault: true,
    });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, cashiers: [...prev.cashiers, { id: (r.data as {id:string}).id, name: "Main Cashier", taxCashierId: cashierTaxId.trim(), isDefault: true }] }));
      setResult({ ok: true, message: `Cashier added (Tax ID: ${cashierTaxId.trim()}).` });
      await advanceStep(9);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to add cashier." });
    }
    setLoading(false);
  }

  // ---- Step 10: Add product ----
  // Good codes are required by SRC manual for every SrcPrintItem (goodCode + adgCode).
  // getGoodList returns goodCode; adgCode is derived as the first 4 chars (HS prefix).
  const [prodName, setProdName] = useState("");
  const [prodGoodCode, setProdGoodCode] = useState("");
  const [prodAdgCode, setProdAdgCode] = useState("");
  const [prodUnit, setProdUnit] = useState("piece");
  const [prodPrice, setProdPrice] = useState("");

  type GoodItem = { goodName: string; goodCode: string; price: number };
  const [goodList, setGoodList] = useState<GoodItem[]>([]);
  const [goodListLoading, setGoodListLoading] = useState(false);
  const [goodListError, setGoodListError] = useState("");

  async function doFetchGoodList() {
    setGoodListLoading(true);
    setGoodListError("");
    const r = await callApi("/api/src/get-good-list", "POST", {
      crn: restaurant.crn,
      tin: restaurant.tin,
      taxRegime: Number(restaurant.departments[0]?.taxRegime ?? 1),
      restaurantId: restaurant.id,
    });
    setGoodListLoading(false);
    if (r.ok) {
      // Response shape: { success, result: SrcResponse<SrcGoodListResult> }
      // SrcResponse wraps: { code, result: { goodLists: [...] } }
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
    // ADG code is the HS chapter prefix — first 4 non-hyphen characters of goodCode
    const adg = good.goodCode.replace("-", "").slice(0, 4);
    setProdAdgCode(adg);
    if (!prodName) setProdName(good.goodName.slice(0, 50));
    if (!prodPrice && good.price > 0) setProdPrice(String(good.price));
  }
  const firstDeptId = useMemo(
    () => restaurant.departments[0]?.id ?? "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [prodDeptId, setProdDeptId] = useState(firstDeptId);

  async function doAddProduct() {
    if (!prodName || !prodGoodCode || !prodAdgCode || !prodDeptId || !prodPrice) {
      setResult({ ok: false, message: "All product fields are required." });
      return;
    }
    setLoading(true);
    setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/products`, "POST", {
      name: prodName, goodCode: prodGoodCode, adgCode: prodAdgCode,
      unit: prodUnit, price: Number(prodPrice), departmentId: prodDeptId,
    });
    if (r.ok) {
      setRestaurant((prev) => ({ ...prev, products: [...prev.products, { id: (r.data as {id:string}).id, name: prodName }] }));
      setResult({ ok: true, message: `Product "${prodName}" added.` });
      await advanceStep(10);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to add product." });
    }
    setLoading(false);
  }

  // ---- Step 11: Generate API key ----
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  async function doGenerateApiKey() {
    setLoading(true);
    setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}/api-keys`, "POST", { label: "POS Terminal" });
    if (r.ok) {
      setApiKey((r.data as { key: string }).key);
      setRestaurant((prev) => ({ ...prev, hasApiKey: true }));
      setResult({ ok: true, message: "API key generated — copy it now, it will not be shown again." });
      await advanceStep(11);
    } else {
      setResult({ ok: false, message: (r.data.error as string) ?? "Failed to generate API key." });
    }
    setLoading(false);
  }

  async function copyKey() {
    if (apiKey) { await navigator.clipboard.writeText(apiKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }
  }

  // ---- Completion check ----
  const isReallyComplete = (
    restaurant.crn &&
    restaurant.hasCert &&
    restaurant.cashiers.length > 0 &&
    restaurant.departments.length > 0 &&
    restaurant.products.length > 0 &&
    restaurant.hasApiKey
  );

  // ===== RENDER =====

  if (sessionExpired) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold text-red-900 mb-2">Session expired</h2>
          <p className="text-sm text-red-700 mb-4">Your login session has expired. Please log in again to continue onboarding.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
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
            Follow these steps to connect to the Armenian SRC tax system.
          </p>
        </div>
        {restaurant.isMockMode && (
          <span className="shrink-0 mt-1 px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full tracking-wide uppercase">
            MOCK MODE
          </span>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s) => {
          const status = stepStatus(s.n);
          return (
            <button
              key={s.n}
              onClick={() => goTo(s.n)}
              title={s.hint}
              className={`shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                status === "active"
                  ? "bg-blue-600 text-white border-blue-600"
                  : status === "completed"
                    ? "bg-green-50 text-green-700 border-green-300"
                    : status === "waiting"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-gray-50 text-gray-400 border-gray-200"
              }`}
            >
              <span>{s.icon}</span>
              <span className="text-[10px]">{s.n}</span>
              {status === "completed" && <span className="text-[9px] text-green-600">✓</span>}
              {status === "waiting" && <span className="text-[9px] text-amber-600">⏳</span>}
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

        {/* ---- Step 1: Enter TIN & Verify Company ---- */}
        {step === 1 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Enter your TIN to look up company data from the Armenian company register. CRN is not needed yet — you will enter it in step 4 after SRC approves your u6 application.
            </p>

            {/* TIN input + lookup button */}
            <div className="flex gap-2 mb-2">
              <input
                value={tinInput}
                onChange={(e) => { setTinInput(e.target.value); setLookupMeta(null); setTinError(""); }}
                maxLength={8}
                placeholder="8-digit TIN, e.g. 02938868"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={doTinLookup}
                disabled={lookupLoading || !/^\d{8}$/.test(tinInput.trim())}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {lookupLoading ? "Looking up…" : "Lookup company"}
              </button>
            </div>

            {/* Loading indicator */}
            {lookupLoading && (
              <p className="text-xs text-gray-500 mb-3 animate-pulse">
                Querying Armenian company register (e-register.moj.am)…
              </p>
            )}

            {/* Error / not found */}
            {tinError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 mb-3">
                {tinError}
              </div>
            )}

            {/* Lookup success banner */}
            {lookupMeta && !lookupMeta.notFound && (
              <div className={`px-3 py-2 rounded-lg text-xs mb-3 border ${
                lookupMeta.isMock
                  ? "bg-yellow-50 border-yellow-300 text-yellow-800"
                  : "bg-green-50 border-green-300 text-green-800"
              }`}>
                {lookupMeta.isMock
                  ? <><span className="font-mono font-bold">[MOCK]</span> {lookupMeta.warning}</>
                  : "Company data loaded from e-register.moj.am (Armenian Ministry of Justice)."}
                {lookupMeta.status && !lookupMeta.isMock && (
                  <span className="ml-2 opacity-75">Active</span>
                )}
              </div>
            )}

            {/* Registry details panel (read-only, collapsible) */}
            {lookupMeta && !lookupMeta.notFound && (lookupMeta.registrationNumber || lookupMeta.registrationDate || lookupMeta.status) && (
              <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-semibold text-gray-700 mb-1">Registry data (read-only)</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {lookupMeta.registrationNumber && (
                    <><dt className="text-gray-500">Reg. number</dt><dd className="font-mono">{lookupMeta.registrationNumber}</dd></>
                  )}
                  {lookupMeta.registrationDate && (
                    <><dt className="text-gray-500">Reg. date</dt><dd>{lookupMeta.registrationDate}</dd></>
                  )}
                  {lookupMeta.status && (
                    <><dt className="text-gray-500 col-span-2">Status</dt><dd className="col-span-2 text-green-700 text-[11px]">{lookupMeta.status}</dd></>
                  )}
                </dl>
                <p className="mt-2 text-gray-400">
                  IP address: Not provided by lookup — must be registered separately in SRC u6 (section 5.2).
                </p>
              </div>
            )}

            {/* Editable fields */}
            <div className="flex flex-col gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Company name</span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Legal address</span>
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Legal address"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 mb-4">
              Server outbound IP address is <strong>not provided by taxpayer lookup</strong> and must be registered separately in the SRC u6 application (section 5.2). See step 3 for details.
            </div>

            <ResultBanner result={result} />
            <div className="flex gap-2">
              <StepButton onClick={doSaveCompany} loading={loading} label="Save company data →" />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(2)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Continue to step 2 →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 2: Generate CSR ---- */}
        {step === 2 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Generate an RSA-2048 key pair and Certificate Signing Request (CSR). The private key is stored encrypted on the server — it never leaves the server.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-600 mb-3">
              CN={restaurant.tin} Tin, OU={restaurant.tin} Tin, O={restaurant.tin} Tin, L=Yerevan, ST=Yerevan, C=AM
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              <strong>Warning:</strong> Re-generating a CSR creates a new private key. Any previously uploaded .p12 certificate signed against the old key will stop working.
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2 flex-wrap">
              <StepButton onClick={doGenerateCsr} loading={loading}
                label={restaurant.hasCsr ? "Re-generate CSR" : "Generate CSR"} />
              {(csrPem || restaurant.hasCsr) && (
                <button
                  onClick={csrPem ? downloadCsr : downloadCsrFromServer}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
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

        {/* ---- Step 3: Submit CSR to SRC (instructions, external action) ---- */}
        {step === 3 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              This step is performed by a human in the SRC taxpayer cabinet. Follow the instructions carefully.
            </p>

            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800 mb-4">
              <strong>Important — browser SSL client certificate required:</strong><br />
              The SRC cabinet (<code className="text-xs bg-amber-100 px-1 rounded">ecrm.taxservice.am</code>) requires a client certificate installed in your browser. Opening it in a normal browser without the certificate will show an <code className="text-xs bg-amber-100 px-1 rounded">ERR_BAD_SSL_CLIENT_AUTH_CERT</code> error.<br />
              <span className="mt-1 block">Use the login method and client certificate provided by SRC for the taxpayer cabinet.</span>
            </div>

            <ol className="list-decimal list-inside flex flex-col gap-3 text-sm text-gray-700 mb-4">
              <li>
                Open the SRC taxpayer cabinet using the required certificate or login method provided by SRC
                (do <strong>not</strong> simply open the URL in a plain browser).
              </li>
              <li>
                Go to <strong>Reports → Application u6</strong> (ՀDM / ECR registration).
              </li>
              <li>
                In section <strong>5.2 &ldquo;IP address&rdquo;</strong>, enter your server&apos;s <strong>production outbound static IP</strong>.
                <div className="mt-2 ml-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  <strong>Vercel users:</strong> Vercel does not provide a stable outbound IP by default. SRC will reject requests from dynamic Vercel IPs. Solutions:
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Use a hosting provider with a fixed outbound IP (Render, Railway, Fly.io with dedicated IP, VPS).</li>
                    <li>Route outbound SRC traffic through a proxy/egress service with a static IP.</li>
                    <li>Use Vercel&apos;s Enterprise static outbound IP feature (paid).</li>
                  </ul>
                </div>
              </li>
              <li>
                In <strong>&ldquo;Certificate signing request&rdquo;</strong>, upload the <code className="bg-gray-100 px-1 rounded">{restaurant.tin}.csr</code> file you downloaded in step 2.
              </li>
              <li>
                Submit the form. SRC will review and approve the application (may take 1–5 business days).
              </li>
              <li>
                After approval, SRC will issue a <strong>CRN</strong> (Cash Register Number) and a <strong>signed .crt</strong> certificate.
                Return to this wizard and complete step 4.
              </li>
            </ol>

            <div className="flex gap-2">
              <button onClick={() => goTo(2)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={() => { advanceStep(3); goTo(4); }} label="CSR submitted → Enter CRN (step 4)" />
            </div>
          </div>
        )}

        {/* ---- Step 4: Enter CRN ---- */}
        {step === 4 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              After SRC approves your u6 application, they issue a <strong>CRN (Cash Register Number)</strong>.
              Enter it here — it is required for all SRC API calls.
            </p>

            {restaurant.crn ? (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ CRN currently set: <code className="font-mono">{restaurant.crn}</code>
              </div>
            ) : (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                CRN not yet set — enter it below after SRC approves your u6 application.
              </div>
            )}

            <label className="flex flex-col gap-1 mb-4">
              <span className="text-sm font-medium text-gray-700">CRN from SRC</span>
              <input
                value={crnInput}
                onChange={(e) => setCrnInput(e.target.value)}
                placeholder="e.g. 52014201"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">From ՀNEH → ECR list → Registration number</span>
            </label>

            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(3)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doSaveCrn} loading={loading} label="Save CRN" />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(5)} className="mt-3 text-sm text-blue-600 hover:underline block">
                CRN saved → Upload certificate (step 5)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 5: Upload Certificate ---- */}
        {step === 5 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Upload the certificate you received from SRC. Choose between uploading a ready-made .p12 or letting the server convert the signed .crt (more secure — private key stays server-side).
            </p>

            {restaurant.hasCert && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Certificate already configured ({restaurant.certConfiguredAt ? new Date(restaurant.certConfiguredAt).toLocaleDateString() : "—"}). You can replace it below.
              </div>
            )}

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setCertMode("p12"); setCertFile(null); setCertError(""); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${certMode === "p12" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"}`}
              >
                Option A: Upload .p12 directly
              </button>
              <button
                onClick={() => { setCertMode("crt"); setCertFile(null); setCertError(""); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${certMode === "crt" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"}`}
              >
                Option B: Upload signed .crt (server converts)
              </button>
            </div>

            {certMode === "p12" && (
              <div className="flex flex-col gap-3 mb-4">
                <p className="text-xs text-gray-500">
                  Combine the signed .crt from SRC with the private key into a .p12 locally, then upload it:
                  <code className="block mt-1 bg-gray-100 p-2 rounded font-mono text-xs break-all">
                    openssl pkcs12 -export -in {restaurant.tin}.crt -inkey {restaurant.tin}.key.pem -out {restaurant.tin}.p12
                  </code>
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">.p12 / .pfx file</span>
                  <input type="file" accept=".p12,.pfx"
                    onChange={(e) => { setCertFile(e.target.files?.[0] ?? null); setCertError(""); }}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Certificate password</span>
                  <input type="password" value={certPassword}
                    onChange={(e) => { setCertPassword(e.target.value); setCertError(""); }}
                    placeholder="Password used when creating the .p12"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </label>
              </div>
            )}

            {certMode === "crt" && (
              <div className="flex flex-col gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  The server will combine the signed .crt from SRC with the private key generated in step 2 to create a .p12 internally. The private key never leaves the server. No password is required — the server generates one automatically.
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Signed .crt from SRC</span>
                  <input type="file" accept=".crt"
                    onChange={(e) => { setCertFile(e.target.files?.[0] ?? null); setCertError(""); }}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
                </label>
              </div>
            )}

            {certError && <p className="text-sm text-red-600 mb-3">{certError}</p>}
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(4)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton
                onClick={certMode === "p12" ? doUploadP12 : doUploadCrt}
                loading={loading}
                label={certMode === "p12" ? "Upload & Validate" : "Upload .crt & Convert"}
              />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(6)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Certificate ready → Test connection (step 6)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 6: Test Connection ---- */}
        {step === 6 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Test the mutual TLS connection to SRC. This verifies that the certificate is accepted and your server&apos;s IP is registered.
            </p>
            {!restaurant.crn && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                CRN is not set — complete step 4 first.{" "}
                <button onClick={() => goTo(4)} className="underline">Go to step 4</button>
              </div>
            )}
            {restaurant.crn && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 mb-4">
                <strong>CRN:</strong> {restaurant.crn}
              </div>
            )}
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(5)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doTestConnection} loading={loading} label="Test SRC connection" />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(7)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Connection OK → Configure departments (step 7)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 7: Configure Departments ---- */}
        {step === 7 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              The system will register one department (dep 1, &ldquo;Main&rdquo;) with SRC automatically.
              Select your tax regime — this is the only business-specific setting required.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-3">
              Department number and name are fixed (dep 1 / &ldquo;Main&rdquo;) — the SRC ECR manual uses a single department for standard setups. Only the tax regime reflects your business type.
            </div>
            {restaurant.departments.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Already configured: dep 1, regime {restaurant.departments[0]?.taxRegime}
              </div>
            )}
            <label className="flex flex-col gap-1 mb-4 max-w-xs">
              <span className="text-sm font-medium text-gray-700">Your tax regime</span>
              <select value={deptRegime} onChange={(e) => setDeptRegime(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="1">1 — VAT (ԱԱՀ) — most businesses</option>
                <option value="2">2 — VAT-exempt</option>
                <option value="3">3 — Turnover tax</option>
                <option value="7">7 — Micro enterprise</option>
              </select>
            </label>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(6)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doConfigureDepts} loading={loading} label="Configure department automatically" />
              {restaurant.departments.length > 0 && (
                <button onClick={() => goTo(8)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already done) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(8)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Department configured → Activate ECR (step 8)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 8: Activate ECR ---- */}
        {step === 8 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Activate the ECR to move it from registration to active status. This must be done once before issuing real receipts.
            </p>
            {restaurant.crn && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 mb-4">
                <strong>CRN:</strong> {restaurant.crn}
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              Call activate only once. If SRC returns error 195 or 196, the ECR is already active — skip to the next step.
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(7)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doActivate} loading={loading} label="Activate ECR" />
              <button onClick={() => goTo(9)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                Already active → Next
              </button>
            </div>
            {result?.ok && (
              <button onClick={() => goTo(9)} className="mt-3 text-sm text-blue-600 hover:underline block">
                ECR activated → Add cashier (step 9)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 9: Add Cashier ---- */}
        {step === 9 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Enter the Tax Cashier ID assigned by SRC. Name and PIN are set automatically.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              <strong>Why manual input is required here:</strong> The SRC API has no endpoint to fetch registered cashier IDs.
              The Tax Cashier ID is assigned by SRC when you register a person in the taxpayer cabinet (u6 → Cashiers section).
              Open your SRC cabinet → ECR page → Cashiers to find the ID.
            </div>
            {restaurant.cashiers.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Cashier added (ID: {restaurant.cashiers[0]?.taxCashierId})
              </div>
            )}
            <label className="flex flex-col gap-1 mb-4 max-w-xs">
              <span className="text-sm font-medium text-gray-700">Tax Cashier ID <span className="text-red-500">*</span></span>
              <input value={cashierTaxId} onChange={(e) => setCashierTaxId(e.target.value)}
                placeholder="e.g. 1"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              <span className="text-xs text-gray-400">SRC cabinet → ECR page → Cashiers section</span>
            </label>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(8)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doAddCashier} loading={loading} label="Add cashier" />
              {restaurant.cashiers.length > 0 && (
                <button onClick={() => goTo(10)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already added) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(10)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Cashier added → Add products (step 10)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 10: Add Products ---- */}
        {step === 10 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Add at least one product. Good code and ADG code are required by SRC for every fiscal receipt line.
              Fetch the code list from SRC to select instead of typing.
            </p>

            {/* Fetch good list from SRC */}
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-medium text-gray-700">SRC product catalogue</span>
                <button
                  onClick={doFetchGoodList}
                  disabled={goodListLoading || !restaurant.crn}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {goodListLoading ? "Fetching…" : "Fetch good list from SRC"}
                </button>
              </div>
              {goodListError && <p className="text-xs text-amber-700">{goodListError}</p>}
              {goodList.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">{goodList.length} items — select one to auto-fill good code and ADG code:</p>
                  <select
                    size={Math.min(goodList.length, 5)}
                    onChange={(e) => {
                      const g = goodList[Number(e.target.value)];
                      if (g) selectGoodCode(g);
                    }}
                    className="w-full text-xs border border-gray-300 rounded p-1 font-mono"
                    defaultValue=""
                  >
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
                <input value={prodName} onChange={(e) => setProdName(e.target.value)}
                  placeholder="e.g. Margherita Pizza" maxLength={50}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Good code <span className="text-red-500">*</span></span>
                <input value={prodGoodCode} onChange={(e) => setProdGoodCode(e.target.value)}
                  placeholder="e.g. 2106-90 (required by SRC)"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                <span className="text-xs text-gray-400">Required — fetched from SRC good list or entered manually</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">ADG code (ԱՏԳ) <span className="text-red-500">*</span></span>
                <input value={prodAdgCode} onChange={(e) => setProdAdgCode(e.target.value)}
                  placeholder="e.g. 2106"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                <span className="text-xs text-gray-400">Auto-filled from good code prefix when fetching from SRC</span>
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
              <button onClick={() => goTo(9)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doAddProduct} loading={loading} label="Add product" />
              {restaurant.products.length > 0 && (
                <button onClick={() => goTo(11)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already added) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(11)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Product added → Generate API key (step 11)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 11: Generate API Key ---- */}
        {step === 11 && (
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
                <p className="text-xs text-amber-600">
                  Use this key as the <code>X-Api-Key</code> header in POS API requests. It will not be shown again.
                </p>
              </div>
            ) : (
              <div className="flex gap-2 mb-4">
                <button onClick={() => goTo(10)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
                <StepButton onClick={doGenerateApiKey} loading={loading} label="Generate API key" />
              </div>
            )}
            {(apiKey || restaurant.hasApiKey) && (
              <button onClick={() => { advanceStep(11); goTo(12); }} className="text-sm text-blue-600 hover:underline block">
                API key ready → Finish (step 12)
              </button>
            )}
          </div>
        )}

        {/* ---- Step 12: Test Receipt & Completion ---- */}
        {step === 12 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Print a test receipt to verify end-to-end fiscalization before going live.
            </p>

            {/* Readiness checklist */}
            <div className="mb-5 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Readiness checklist
              </div>
              {[
                { label: "CRN set",              ok: !!restaurant.crn,                    fix: 4 },
                { label: "Certificate uploaded",  ok: restaurant.hasCert,                  fix: 5 },
                { label: "Departments configured",ok: restaurant.departments.length > 0,   fix: 7 },
                { label: "Cashier added",          ok: restaurant.cashiers.length > 0,      fix: 9 },
                { label: "Products added",         ok: restaurant.products.length > 0,      fix: 10 },
                { label: "API key generated",      ok: restaurant.hasApiKey,                fix: 11 },
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
              <Link href={`/receipts/new`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Create test receipt →
              </Link>
              <Link href={`/admin/restaurants/${restaurant.id}`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Restaurant dashboard
              </Link>
            </div>

            {isReallyComplete ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <div className="text-3xl mb-2">✓</div>
                <h3 className="font-semibold text-green-900 mb-1">Ready for live fiscalization</h3>
                <p className="text-sm text-green-700 mb-3">
                  All required steps are complete. Use the API key to connect your POS system.
                  {restaurant.isMockMode && " (Currently in MOCK MODE — set TAX_API_MODE=src_real and deploy with a static outbound IP for production.)"}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>Not yet complete:</strong> Complete all items in the checklist above before going live.
                {!restaurant.isMockMode && " In real mode, fiscalization will fail until all required data is present."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StepButton({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
    >
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
