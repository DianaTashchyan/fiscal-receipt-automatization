"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { AutoConfigStatus } from "@/app/api/restaurants/[id]/post-cert-configure/route";

type Cashier    = { id: string; name: string; taxCashierId: string | null; isDefault: boolean };
type Department = { id: string; name: string; taxDepartmentId: string | null; taxRegime: string | null };

type RestaurantData = {
  id: string; name: string; tin: string; crn: string | null; address: string;
  platformName: string | null; websiteUrl: string | null;
  outboundIp: string | null;
  hasCsr: boolean; csrCreatedAt: string | null;
  hasCert: boolean; certConfiguredAt: string | null;
  onboardingStep: number;
  cashiers: Cashier[];
  departments: Department[];
  hasApiKey: boolean;
  isMockMode: boolean;
};

const STEPS = [
  { n: 1, title: "Company Info",      short: "Company",     description: "Verify your company by tax ID" },
  { n: 2, title: "Generate CSR",      short: "CSR",         description: "Create your cryptographic key pair" },
  { n: 3, title: "Register with SRC", short: "Register",    description: "Submit CSR to the SRC taxpayer portal" },
  { n: 4, title: "Upload Certificate", short: "Certificate", description: "Upload the signed certificate from SRC" },
  { n: 5, title: "SRC Configuration", short: "Configure",   description: "Enter SRC IDs from your cabinet" },
  { n: 6, title: "API Key",           short: "API Key",     description: "Generate your POS integration key" },
  { n: 7, title: "Complete",          short: "Done",        description: "Setup complete — ready for fiscalization" },
];

function taxRegimeName(regime: string | null): string {
  if (!regime) return "Not configured";
  const map: Record<string, string> = { "1": "VAT", "2": "VAT-exempt", "3": "Turnover tax", "7": "Micro business" };
  return map[regime] ?? `Regime ${regime}`;
}

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

  function mapDbStepToWizard(dbStep: number): number {
    if (dbStep <= 0) return 1;
    if (dbStep <= 2) return dbStep;
    if (dbStep === 3) return 3;
    if (dbStep === 4) return 4;
    if (dbStep <= 9) return 5;
    if (dbStep <= 11) return 6;
    return 7;
  }

  // Land on step 5 if cert is uploaded but SRC fields are still missing.
  // taxDepartmentId is always auto-set to "1" (we choose dep IDs, SRC doesn't assign them).
  const deptOk = !!initial.departments[0]?.taxRegime;
  const cashierOk = !!initial.cashiers[0]?.taxCashierId;
  const initialStep = (!deptOk || !cashierOk) && initial.hasCert
    ? 5
    : mapDbStepToWizard(initial.onboardingStep >= 12 ? 12 : initial.onboardingStep + 1);

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
    setStep(Math.max(1, Math.min(n, 7)));
    setResult(null);
  }

  function stepStatus(n: number): "completed" | "active" | "pending" {
    const dbThreshold = [0, 1, 2, 3, 5, 9, 11, 12][n] ?? 12;
    if (restaurant.onboardingStep >= dbThreshold) return "completed";
    if (step === n) return "active";
    return "pending";
  }

  const completedCount = STEPS.filter((s) => stepStatus(s.n) === "completed").length;
  const progressPct = Math.round((completedCount / STEPS.length) * 100);

  // ── Auto-configure state ────────────────────────────────────────────────────
  const [autoConfig, setAutoConfig] = useState<AutoConfigStatus | null>(() => {
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
        generatedApiKey: null,
      };
    }
    return null;
  });
  const [autoConfigLoading, setAutoConfigLoading] = useState(false);

  // Key auto-generated in this session (shown once — user must copy)
  const [autoGeneratedKey, setAutoGeneratedKey] = useState<string | null>(null);
  const [autoKeyCopied, setAutoKeyCopied] = useState(false);

  // ── Inline PATCH form — department SRC fields ─────────────────────────────
  // taxDepartmentId is auto-set to "1" (we define dep IDs) — only taxRegime needs operator input.
  const [deptPatchTaxRegime, setDeptPatchTaxRegime] = useState(initial.departments[0]?.taxRegime ?? "1");
  const [deptPatchSaving, setDeptPatchSaving]      = useState(false);
  const [deptPatchError, setDeptPatchError]        = useState("");

  // ── Inline PATCH form — cashier SRC field ────────────────────────────────
  const [cashierPatchTaxId, setCashierPatchTaxId]   = useState(initial.cashiers[0]?.taxCashierId ?? "");
  const [cashierPatchSaving, setCashierPatchSaving] = useState(false);
  const [cashierPatchError, setCashierPatchError]   = useState("");

  async function doPatchDepartment() {
    const deptId = restaurant.departments[0]?.id;
    if (!deptId) return;
    if (!["1", "2", "3", "7"].includes(deptPatchTaxRegime)) {
      setDeptPatchError("Select a tax regime.");
      return;
    }
    setDeptPatchSaving(true);
    setDeptPatchError("");
    const r = await callApi(
      `/api/restaurants/${restaurant.id}/departments/${deptId}`,
      "PATCH",
      { taxRegime: deptPatchTaxRegime }
    );
    setDeptPatchSaving(false);
    if (r.ok) {
      const d = r.data as { taxDepartmentId: string; taxRegime: string };
      setRestaurant((prev) => ({
        ...prev,
        departments: prev.departments.map((dept, i) =>
          i === 0 ? { ...dept, taxDepartmentId: d.taxDepartmentId, taxRegime: d.taxRegime } : dept
        ),
      }));
      // taxRegime is now set — auto-run configureDepartments via post-cert-configure
      await runAutoConfig();
    } else {
      setDeptPatchError((r.data.error as string) ?? "Failed to save department settings.");
    }
  }

  async function doPatchCashier() {
    const cashierId = restaurant.cashiers[0]?.id;
    if (!cashierId) return;
    const taxId = cashierPatchTaxId.trim();
    if (!taxId) {
      setCashierPatchError("SRC Cashier ID is required.");
      return;
    }
    setCashierPatchSaving(true);
    setCashierPatchError("");
    const r = await callApi(
      `/api/restaurants/${restaurant.id}/cashiers/${cashierId}`,
      "PATCH",
      { taxCashierId: taxId }
    );
    setCashierPatchSaving(false);
    if (r.ok) {
      const c = r.data as { taxCashierId: string };
      setRestaurant((prev) => ({
        ...prev,
        cashiers: prev.cashiers.map((cashier, i) =>
          i === 0 ? { ...cashier, taxCashierId: c.taxCashierId } : cashier
        ),
      }));
    } else {
      setCashierPatchError((r.data.error as string) ?? "Failed to save cashier settings.");
    }
  }

  async function runAutoConfig() {
    setAutoConfigLoading(true);
    const r = await callApi(`/api/restaurants/${restaurant.id}/post-cert-configure`, "POST");
    setAutoConfigLoading(false);
    if (r.ok) {
      const ac = r.data as AutoConfigStatus;
      setAutoConfig(ac);
      if (ac.crn) setRestaurant((prev) => ({ ...prev, crn: ac.crn }));
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
      if (ac.generatedApiKey) {
        setAutoGeneratedKey(ac.generatedApiKey);
        setRestaurant((prev) => ({ ...prev, hasApiKey: true }));
        await advanceDbStep(11);
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
  const [platformNameInput, setPlatformNameInput] = useState(restaurant.platformName ?? "Glana");
  const [websiteUrlInput, setWebsiteUrlInput] = useState(restaurant.websiteUrl ?? "https://app.glana.am");
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
    if (d.notFound) { setTinError(`TIN ${t} not found in the Armenian company register.`); return; }
    setLookupMeta({ isMock: d.isMock, status: d.status ?? null, registrationNumber: d.registrationNumber ?? null, registrationDate: d.registrationDate ?? null, notFound: false, warning: d.isMock ? (d.error ?? "Using mock data.") : null });
    if (d.name) setCompanyName(d.name);
    if (d.address) setCompanyAddress(d.address);
  }

  async function doSaveCompany() {
    if (!companyName.trim() || !companyAddress.trim()) { setResult({ ok: false, message: "Company name and address are required." }); return; }
    if (websiteUrlInput.trim() && !/^https:\/\/.+/.test(websiteUrlInput.trim())) {
      setResult({ ok: false, message: "Website URL must start with https://" }); return;
    }
    setLoading(true); setResult(null);
    const r = await callApi(`/api/restaurants/${restaurant.id}`, "PATCH", {
      tin: tinInput.trim(),
      name: companyName.trim(),
      address: companyAddress.trim(),
      platformName: platformNameInput.trim() || null,
      websiteUrl: websiteUrlInput.trim() || null,
    });
    if (r.ok) {
      const saved = r.data as { srcIpAddress?: string | null };
      setRestaurant((prev) => ({
        ...prev,
        tin: tinInput.trim(),
        name: companyName.trim(),
        address: companyAddress.trim(),
        platformName: platformNameInput.trim() || null,
        websiteUrl: websiteUrlInput.trim() || null,
        outboundIp: saved.srcIpAddress ?? null,
      }));
      setResult({ ok: true, message: "Company data saved successfully." });
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
      setResult({ ok: true, message: "CSR generated. Download it before continuing." });
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
    const r = await callApi(`/api/restaurants/${restaurant.id}/upload-crt`, "POST", { crtBase64, filename: certFile.name });
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

  // ── Step 6: API Key ─────────────────────────────────────────────────────────
  const [apiKey, setApiKey]     = useState<string | null>(null);
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

  async function copyAutoKey() {
    if (autoGeneratedKey) { await navigator.clipboard.writeText(autoGeneratedKey); setAutoKeyCopied(true); setTimeout(() => setAutoKeyCopied(false), 2000); }
  }

  const dept    = restaurant.departments[0];
  const cashier = restaurant.cashiers[0];
  const isReallyComplete = (
    restaurant.hasCert &&
    !!dept && !!dept.taxDepartmentId && !!dept.taxRegime &&
    !!cashier && !!cashier.taxCashierId &&
    restaurant.hasApiKey
  );

  // Mark onboarding complete (dbStep 12) as soon as step 7 is reached and all checks pass.
  useEffect(() => {
    if (step === 7 && isReallyComplete && restaurant.onboardingStep < 12) {
      advanceDbStep(12);
    }
  // advanceDbStep is stable (only uses restaurant.id which doesn't change)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isReallyComplete]);

  // ── SESSION EXPIRED ─────────────────────────────────────────────────────────
  if (sessionExpired) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-10">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Session expired</h2>
          <p className="text-sm text-gray-500 mb-5">Your session has timed out. Please log in again to continue.</p>
          <button onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            Log in again
          </button>
        </div>
      </div>
    );
  }

  const currentStepMeta = STEPS[step - 1];

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <Link href={`/admin/restaurants/${restaurant.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {restaurant.name}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SRC Integration Setup</h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect your account to the Armenian Tax Service (SRC) for fiscal receipt issuance.
            </p>
          </div>
          {restaurant.isMockMode && (
            <span className="shrink-0 mt-0.5 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
              Mock Mode
            </span>
          )}
        </div>
      </div>

      {/* ── Stepper ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Step {step} of {STEPS.length}</span>
          <span className="text-xs font-medium text-gray-500">{progressPct}% complete</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progressPct, step === 1 ? 4 : 0)}%` }}
          />
        </div>

        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const status = stepStatus(s.n);
            const isLast = i === STEPS.length - 1;
            return (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => goTo(s.n)}
                  title={s.description}
                  className="flex flex-col items-center gap-1 group focus:outline-none"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 ${
                    status === "completed"
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : status === "active"
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200"
                      : "bg-white border-gray-200 text-gray-400 group-hover:border-gray-300"
                  }`}>
                    {status === "completed" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span>{s.n}</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium hidden sm:block ${
                    status === "active" ? "text-blue-600" : status === "completed" ? "text-emerald-600" : "text-gray-400"
                  }`}>
                    {s.short}
                  </span>
                </button>
                {!isLast && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 sm:mb-5 transition-colors ${
                    stepStatus(s.n) === "completed" ? "bg-emerald-300" : "bg-gray-100"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step card ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-7 py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
              stepStatus(step) === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {stepStatus(step) === "completed" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span>{step}</span>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{currentStepMeta.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{currentStepMeta.description}</p>
            </div>
          </div>
        </div>

        {/* Card body */}
        <div className="px-7 py-6">

          {/* ── Step 1: Company Info ── */}
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Enter your 8-digit Tax Identification Number (TIN) to automatically load your company information from the Armenian business registry.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tax Identification Number (TIN)</label>
                <div className="flex gap-2">
                  <input
                    value={tinInput}
                    onChange={(e) => { setTinInput(e.target.value); setLookupMeta(null); setTinError(""); }}
                    maxLength={8}
                    placeholder="00000000"
                    className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  <button
                    onClick={doTinLookup}
                    disabled={lookupLoading || !/^\d{8}$/.test(tinInput.trim())}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {lookupLoading ? (
                      <span className="flex items-center gap-2"><Spinner size="sm" /> Looking up…</span>
                    ) : "Look up"}
                  </button>
                </div>
                {tinError && <InlineError message={tinError} />}
                {lookupMeta && !lookupMeta.notFound && (
                  <div className={`mt-2 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-xs border ${
                    lookupMeta.isMock
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}>
                    <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    {lookupMeta.isMock
                      ? <span><strong>Mock data</strong> — {lookupMeta.warning}</span>
                      : "Company data loaded from the Armenian business registry."}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <FormField label="Company name" hint="From registry — read-only">
                  <input
                    value={companyName}
                    readOnly
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-100 text-gray-600 cursor-default select-all"
                  />
                </FormField>
                <FormField label="Legal address" hint="From registry — read-only">
                  <input
                    value={companyAddress}
                    readOnly
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-100 text-gray-600 cursor-default select-all"
                  />
                </FormField>
                <FormField label="Platform name" hint="SRC cabinet field 5.4">
                  <input
                    value={platformNameInput}
                    onChange={(e) => setPlatformNameInput(e.target.value)}
                    placeholder="e.g. Glana"
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </FormField>
                <FormField label="Website URL" hint="SRC cabinet field 5.3 — must start with https://">
                  <input
                    value={websiteUrlInput}
                    onChange={(e) => setWebsiteUrlInput(e.target.value)}
                    placeholder="https://app.glana.am"
                    type="url"
                    className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </FormField>
              </div>

              <ResultBanner result={result} />

              <ActionBar
                onBack={undefined}
                onPrimary={doSaveCompany}
                primaryLabel="Save and continue"
                primaryLoading={loading}
                onNext={result?.ok || restaurant.onboardingStep >= 1 ? () => goTo(2) : undefined}
                nextLabel="Go to step 2 →"
              />
            </div>
          )}

          {/* ── Step 2: Generate CSR ── */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Generate a cryptographic key pair and a Certificate Signing Request (CSR). The private key is stored securely on the server and never leaves it.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Certificate subject</p>
                <code className="text-xs text-gray-600 font-mono break-all leading-relaxed">
                  CN={restaurant.tin} Tin, OU={restaurant.tin} Tin, O={restaurant.tin} Tin, L=Yerevan, ST=Yerevan, C=AM
                </code>
              </div>

              <Notice variant="warning">
                Regenerating a CSR creates a new private key. Any previously uploaded certificate will stop working.
              </Notice>

              {restaurant.hasCsr && (
                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    CSR on file, generated{" "}
                    {restaurant.csrCreatedAt ? new Date(restaurant.csrCreatedAt).toLocaleString() : "previously"}.
                  </span>
                </div>
              )}

              <ResultBanner result={result} />

              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={doGenerateCsr} loading={loading} label={restaurant.hasCsr ? "Regenerate CSR" : "Generate CSR"} />
                {(csrPem || restaurant.hasCsr) && (
                  <SecondaryButton
                    onClick={csrPem ? downloadCsr : downloadCsrFromServer}
                    label={`Download ${restaurant.tin}.csr`}
                    icon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    }
                  />
                )}
              </div>

              {(csrPem || restaurant.hasCsr) && (
                <ActionBar
                  onBack={() => goTo(1)}
                  onNext={() => goTo(3)}
                  nextLabel="Continue to registration →"
                />
              )}
            </div>
          )}

          {/* ── Step 3: Register with SRC ── */}
          {step === 3 && (
            <div className="space-y-5">
              <Notice variant="info">
                This step is completed in the SRC taxpayer portal, outside this application. Follow the instructions below.
              </Notice>

              <Notice variant="warning">
                <strong>Browser certificate required:</strong> The SRC portal requires a client certificate to open. Without it you will see <code className="text-xs bg-amber-100 px-1 rounded">ERR_BAD_SSL_CLIENT_AUTH_CERT</code>.
              </Notice>

              {/* SRC Cabinet registration values panel */}
              <SrcCabinetPanel
                outboundIp={restaurant.outboundIp}
                websiteUrl={restaurant.websiteUrl}
                platformName={restaurant.platformName}
                restaurantId={restaurant.id}
                onGoToStep1={() => goTo(1)}
              />

              <div className="space-y-3">
                {[
                  { n: 1, text: <>Open the SRC taxpayer portal using the certificate or login method provided by SRC.</> },
                  { n: 2, text: <>Navigate to <strong>Reports → Application u6</strong> (ECR registration).</> },
                  { n: 3, text: <>In section <strong>5.2 "IP address"</strong>, enter your server&apos;s static outbound IP address.</> },
                  { n: 4, text: <>In <strong>"Certificate Signing Request"</strong>, upload the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{restaurant.tin}.csr</code> file downloaded in step 2.</> },
                  { n: 5, text: <>Submit the form. SRC typically reviews applications within <strong>1–5 business days</strong>.</> },
                  { n: 6, text: <>Once approved, SRC will provide a signed <strong>.crt</strong> certificate file. Proceed to step 4.</> },
                ].map((item) => (
                  <div key={item.n} className="flex gap-3.5">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.n}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>

              <Notice variant="info">
                Once SRC approves your u6 application, upload the signed .crt in step 4. A default department and cashier will be created automatically — you will only need to enter the SRC IDs from your cabinet.
              </Notice>

              <ActionBar
                onBack={() => goTo(2)}
                onPrimary={() => { advanceDbStep(3); goTo(4); }}
                primaryLabel="CSR submitted — upload certificate →"
              />
            </div>
          )}

          {/* ── Step 4: Upload Certificate ── */}
          {step === 4 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Upload the signed certificate file you received from SRC. A department and cashier will be created automatically — you will only need to enter the SRC IDs in step 5.
              </p>

              {restaurant.hasCert && (
                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Certificate already on file (uploaded{" "}
                    {restaurant.certConfiguredAt ? new Date(restaurant.certConfiguredAt).toLocaleDateString() : "previously"}).
                    You can replace it below.
                  </span>
                </div>
              )}

              {/* Mode toggle */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Certificate format</p>
                <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
                  {(["crt", "p12"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setCertMode(mode); setCertFile(null); setCertError(""); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        certMode === mode
                          ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {mode === "crt" ? "Signed .crt file (recommended)" : ".p12 / .pfx bundle"}
                    </button>
                  ))}
                </div>
              </div>

              {/* CRT mode */}
              {certMode === "crt" && (
                <div className="space-y-3">
                  <Notice variant="info">
                    The server will combine the signed .crt with your private key from step 2 to create the certificate bundle internally.
                  </Notice>
                  <FormField label="Signed .crt from SRC">
                    <FileInput
                      accept=".crt"
                      value={certFile}
                      onChange={(f) => { setCertFile(f); setCertError(""); }}
                      placeholder="Choose .crt file"
                    />
                  </FormField>
                </div>
              )}

              {/* P12 mode */}
              {certMode === "p12" && (
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Combine .crt + key into .p12</p>
                    <code className="block text-xs font-mono text-gray-600 break-all leading-relaxed">
                      openssl pkcs12 -export -in {restaurant.tin}.crt -inkey {restaurant.tin}.key.pem -out {restaurant.tin}.p12
                    </code>
                  </div>
                  <FormField label=".p12 or .pfx file">
                    <FileInput
                      accept=".p12,.pfx"
                      value={certFile}
                      onChange={(f) => { setCertFile(f); setCertError(""); }}
                      placeholder="Choose .p12 or .pfx file"
                    />
                  </FormField>
                  <FormField label="Certificate password">
                    <input
                      type="password"
                      value={certPassword}
                      onChange={(e) => { setCertPassword(e.target.value); setCertError(""); }}
                      placeholder="Password used when creating the .p12"
                      className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </FormField>
                </div>
              )}

              {certError && <InlineError message={certError} />}

              {(loading || autoConfigLoading) && (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  <Spinner size="sm" />
                  <span>{loading ? "Uploading certificate…" : "Running auto-setup (CRN · Department · Cashier · API Key)…"}</span>
                </div>
              )}

              <ResultBanner result={result} />

              <ActionBar
                onBack={() => goTo(3)}
                onPrimary={certMode === "p12" ? doUploadP12 : doUploadCrt}
                primaryLabel={certMode === "crt" ? "Upload certificate & auto-configure" : "Upload .p12 & auto-configure"}
                primaryLoading={loading || autoConfigLoading}
              />

              {restaurant.hasCert && !loading && !autoConfigLoading && (
                <button
                  onClick={() => { runAutoConfig().then(() => goTo(5)); }}
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Re-run auto-configuration →
                </button>
              )}
            </div>
          )}

          {/* ── Step 5: SRC Configuration ── */}
          {step === 5 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                A department and cashier were created automatically. Enter the IDs assigned by SRC to complete setup.
                Everything else — the department, the cashier record, and your API key — was provisioned automatically.
              </p>

              {autoConfigLoading && (
                <div className="flex items-center gap-3 px-4 py-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  <Spinner size="sm" />
                  <span>Running auto-configuration… This may take 10–30 seconds.</span>
                </div>
              )}

              {!autoConfig && !autoConfigLoading && (
                <div className="px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  Auto-configuration has not run yet.{" "}
                  {restaurant.hasCert ? (
                    <button onClick={() => runAutoConfig()} className="font-semibold underline">Run it now →</button>
                  ) : (
                    "Upload your certificate in step 4 first."
                  )}
                </div>
              )}

              {/* Auto-setup status rows */}
              {autoConfig && (
                <div className="space-y-2.5">
                  <ConfigRow
                    label="Cash Register Number (CRN)"
                    value={autoConfig.crn}
                    sourceLabel={
                      autoConfig.crnSource === "certificate" ? "Extracted from certificate"
                      : autoConfig.crnSource === "database" ? "On file"
                      : autoConfig.crnSource === "mock-auto" ? "Auto-assigned (mock mode)"
                      : null
                    }
                    error={autoConfig.crnError}
                    isMock={autoConfig.isMockMode}
                  />
                  <ConfigRow
                    label="SRC Connection (mTLS)"
                    value={autoConfig.connected ? "Connected — certificate accepted by SRC" : null}
                    sourceLabel={autoConfig.connected ? "Verified" : null}
                    error={autoConfig.connectionError}
                    isMock={autoConfig.isMockMode}
                  />
                  <ConfigRow
                    label="ECR Activation"
                    value={autoConfig.activated ? "ECR activated successfully" : null}
                    sourceLabel={autoConfig.activated ? "Activated" : null}
                    error={autoConfig.activationError}
                    isMock={autoConfig.isMockMode}
                  />
                </div>
              )}

              {/* Auto-generated API key — shown once, must be copied now */}
              {autoGeneratedKey && (
                <div className="border border-emerald-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-semibold text-emerald-800">API Key generated automatically</p>
                  </div>
                  <div className="px-4 py-4 space-y-3">
                    <div className="bg-gray-900 rounded-xl p-4 flex items-start gap-3">
                      <code className="text-emerald-400 text-xs font-mono flex-1 break-all leading-relaxed">{autoGeneratedKey}</code>
                      <button
                        onClick={copyAutoKey}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          autoKeyCopied ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                        }`}
                      >
                        {autoKeyCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      <span>Copy this key now — it will not be shown again. Use it as the <code className="font-mono bg-amber-100 px-1 rounded">X-Api-Key</code> header in all POS requests.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Required: Department SRC settings */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    {dept?.taxRegime ? (
                      <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-amber-400 shrink-0 inline-block" />
                    )}
                    <p className="text-sm font-semibold text-gray-700">
                      Tax Department
                      {!dept?.taxRegime ? (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Required</span>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pl-6">
                    {dept?.taxRegime
                      ? `${dept.name} — Dept ID ${dept.taxDepartmentId ?? "1"} — ${taxRegimeName(dept.taxRegime)}`
                      : `"${dept?.name ?? "Main Department"}" created automatically — select your tax regime below`}
                  </p>
                </div>

                {dept?.taxRegime ? (
                  <div className="px-4 py-3 flex items-center gap-3 text-sm text-emerald-700">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Dept ID: <strong>{dept.taxDepartmentId ?? "1"}</strong> — {taxRegimeName(dept.taxRegime)}</span>
                  </div>
                ) : (
                  <div className="px-4 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept ID</p>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3.5 py-2.5 bg-gray-100">
                          <code className="text-sm font-mono text-gray-600">1</code>
                          <span className="text-xs text-gray-400 ml-auto">auto-assigned</span>
                        </div>
                      </div>
                      <FormField label="Tax Regime" required hint="your SRC classification">
                        <select
                          value={deptPatchTaxRegime}
                          onChange={(e) => { setDeptPatchTaxRegime(e.target.value); setDeptPatchError(""); }}
                          className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                          <option value="1">1 — VAT</option>
                          <option value="2">2 — VAT-exempt</option>
                          <option value="3">3 — Turnover tax</option>
                          <option value="7">7 — Micro business</option>
                        </select>
                      </FormField>
                    </div>
                    {deptPatchError && <InlineError message={deptPatchError} />}
                    <PrimaryButton onClick={doPatchDepartment} loading={deptPatchSaving} label="Save tax regime" />
                  </div>
                )}
              </div>

              {/* Required: Cashier SRC settings */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    {cashier?.taxCashierId ? (
                      <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-amber-400 shrink-0 inline-block" />
                    )}
                    <p className="text-sm font-semibold text-gray-700">
                      Cashier
                      {!cashier?.taxCashierId ? (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Required</span>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pl-6">
                    {cashier?.taxCashierId
                      ? `${cashier.name} — SRC ID ${cashier.taxCashierId}`
                      : `"${cashier?.name ?? "Online Cashier"}" was created automatically — enter the SRC Cashier ID below`}
                  </p>
                </div>

                {cashier?.taxCashierId ? (
                  <div className="px-4 py-3 flex items-center gap-3 text-sm text-emerald-700">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>SRC Cashier ID: <strong>{cashier.taxCashierId}</strong></span>
                  </div>
                ) : (
                  <div className="px-4 py-4 space-y-3">
                    <FormField label="SRC Cashier ID" required hint="SRC cabinet → ECR page → Cashiers column">
                      <input
                        value={cashierPatchTaxId}
                        onChange={(e) => { setCashierPatchTaxId(e.target.value); setCashierPatchError(""); }}
                        placeholder="e.g. 1"
                        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                    </FormField>
                    {cashierPatchError && <InlineError message={cashierPatchError} />}
                    <PrimaryButton onClick={doPatchCashier} loading={cashierPatchSaving} label="Save cashier ID" />
                  </div>
                )}
              </div>

              {autoConfig?.crnError && (
                <Notice variant="error">
                  <strong>CRN error:</strong> {autoConfig.crnError}
                </Notice>
              )}

              <ResultBanner result={result} />

              <div className="flex flex-wrap gap-2">
                <GhostButton onClick={() => goTo(4)} label="← Back to certificate upload" />
                {restaurant.hasCert && (
                  <GhostButton
                    onClick={() => runAutoConfig()}
                    label={autoConfigLoading ? "Running…" : "Re-run auto-configuration"}
                    disabled={autoConfigLoading}
                  />
                )}
              </div>

              {dept?.taxRegime && cashier?.taxCashierId && (
                <ActionBar
                  onNext={() => goTo(6)}
                  nextLabel="Continue to API key →"
                />
              )}
            </div>
          )}

          {/* ── Step 6: API Key ── */}
          {step === 6 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Generate an API key to authenticate your point-of-sale system. Copy it immediately — it is only shown once.
              </p>

              {restaurant.hasApiKey && !apiKey && (
                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {autoGeneratedKey
                      ? "API key was generated automatically in step 5 — copy it there if you haven't already."
                      : "An API key already exists for this account. Generate a new one below if needed."}
                  </span>
                </div>
              )}

              <ResultBanner result={result} />

              {apiKey ? (
                <div className="space-y-3">
                  <div className="bg-gray-900 rounded-xl p-4 flex items-start gap-3">
                    <code className="text-emerald-400 text-xs font-mono flex-1 break-all leading-relaxed">{apiKey}</code>
                    <button
                      onClick={copyKey}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        keyCopied
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                      }`}
                    >
                      {keyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span>Send this key as the <code className="font-mono bg-amber-100 px-1 rounded">X-Api-Key</code> header in all POS API requests. It will not be shown again.</span>
                  </div>
                  <ActionBar onNext={() => { advanceDbStep(11); goTo(7); }} nextLabel="Continue to completion →" />
                </div>
              ) : (
                <ActionBar
                  onBack={() => goTo(5)}
                  onPrimary={doGenerateApiKey}
                  primaryLabel="Generate API key"
                  primaryLoading={loading}
                />
              )}

              {(apiKey || restaurant.hasApiKey) && !apiKey && (
                <button onClick={() => { advanceDbStep(11); goTo(7); }} className="text-sm text-blue-600 hover:underline">
                  Skip — already have a key →
                </button>
              )}
            </div>
          )}

          {/* ── Step 7: Complete ── */}
          {step === 7 && (
            <div className="space-y-6">
              {isReallyComplete ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Ready for live fiscalization</h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    All required steps are complete.
                    {restaurant.isMockMode && (
                      <span className="block mt-2 text-amber-600">
                        Set <code className="font-mono text-xs bg-amber-50 px-1 rounded">TAX_API_MODE=src_real</code> and deploy with a static outbound IP to go live.
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  Complete all items in the checklist below before going live.
                </div>
              )}

              {/* Readiness checklist */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Readiness checklist</p>
                </div>
                {[
                  { label: "Certificate uploaded",                 ok: restaurant.hasCert,              fix: 4 },
                  { label: "Dept ID configured (auto-assigned 1)", ok: !!dept?.taxDepartmentId,         fix: 5 },
                  { label: "Tax Regime set",                       ok: !!dept?.taxRegime,               fix: 5 },
                  { label: "SRC Cashier ID set",                   ok: !!cashier?.taxCashierId,         fix: 5 },
                  { label: "API key generated",                    ok: restaurant.hasApiKey,            fix: 6 },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between px-4 py-3.5 border-b border-gray-100 last:border-0 transition-colors ${
                      item.ok ? "bg-white" : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        item.ok ? "bg-emerald-100" : "bg-red-100"
                      }`}>
                        {item.ok ? (
                          <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${item.ok ? "text-gray-700" : "text-red-700 font-medium"}`}>
                        {item.label}
                      </span>
                    </div>
                    {!item.ok && (
                      <button
                        onClick={() => goTo(item.fix)}
                        className="text-xs text-blue-600 font-semibold hover:underline"
                      >
                        Complete step {item.fix} →
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/receipts/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Create test receipt
                </Link>
                <Link
                  href={`/admin/restaurants/${restaurant.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Business dashboard
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── SRC Cabinet registration panel ──────────────────────────────────────────────

function SrcCabinetPanel({
  outboundIp, websiteUrl, platformName, restaurantId, onGoToStep1,
}: {
  outboundIp: string | null;
  websiteUrl: string | null;
  platformName: string | null;
  restaurantId: string;
  onGoToStep1?: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [ipEditMode, setIpEditMode] = useState(false);
  const [ipInput, setIpInput] = useState("");
  const [ipSaving, setIpSaving] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);
  // Local display IP — updated after user saves a manual override
  const [displayIp, setDisplayIp] = useState<string | null>(outboundIp);

  const primaryIp = displayIp ?? null;
  const hostname = (() => { try { return websiteUrl ? new URL(websiteUrl).hostname : null; } catch { return null; } })();

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  }

  async function copyAll() {
    const parts = [
      primaryIp    ? `Field 5.2 IP address:    ${primaryIp}` : null,
      websiteUrl   ? `Field 5.3 Website URL:   ${websiteUrl}` : null,
      platformName ? `Field 5.4 Platform name: ${platformName}` : null,
    ].filter(Boolean);
    if (!parts.length) return;
    await navigator.clipboard.writeText(parts.join("\n"));
    setCopied("all");
    setTimeout(() => setCopied((c) => (c === "all" ? null : c)), 2000);
  }

  function startIpEdit() {
    setIpInput(primaryIp ?? "");
    setIpError(null);
    setIpEditMode(true);
  }

  async function saveIpEdit() {
    const val = ipInput.trim();
    if (val && !/^\d{1,3}(\.\d{1,3}){3}$/.test(val)) {
      setIpError("Enter a valid IPv4 address (e.g. 159.89.213.138)");
      return;
    }
    setIpSaving(true);
    setIpError(null);
    const res = await api(`/api/restaurants/${restaurantId}`, "PATCH", {
      srcIpAddress: val || null,
    });
    setIpSaving(false);
    if (!res.ok) {
      setIpError((res.data as { error?: string }).error ?? "Save failed");
      return;
    }
    setDisplayIp(val || null);
    setIpEditMode(false);
  }

  const rows: { field: string; label: string; value: string | null; hint: string | null; key: string; editable?: boolean }[] = [
    { field: "5.2", label: "IP address",    value: primaryIp,   hint: hostname ? `resolved from ${hostname}` : null, key: "ip",       editable: true },
    { field: "5.3", label: "Website URL",   value: websiteUrl,   hint: null,                                          key: "url" },
    { field: "5.4", label: "Platform name", value: platformName, hint: null,                                          key: "platform" },
  ];

  return (
    <div className="border border-blue-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-900">Information to enter in SRC cabinet</p>
          <p className="text-xs text-blue-700 mt-0.5">Copy these values into the u6 form fields before uploading your CSR.</p>
        </div>
        {rows.some((r) => r.value) && !ipEditMode && (
          <button
            onClick={copyAll}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              copied === "all"
                ? "bg-blue-600 text-white"
                : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-100"
            }`}
          >
            {copied === "all" ? "Copied!" : "Copy all"}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {rows.map(({ field, label, value, hint, key, editable }) => (
          <div key={key} className="flex items-start gap-3 px-4 py-3">
            <span className="shrink-0 w-10 text-xs font-mono font-bold text-gray-400 mt-0.5">{field}</span>
            <span className="w-28 shrink-0 text-xs font-medium text-gray-500 mt-0.5">{label}</span>

            {editable && ipEditMode ? (
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => { setIpInput(e.target.value); setIpError(null); }}
                    placeholder="e.g. 159.89.213.138"
                    className="flex-1 px-2.5 py-1 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") saveIpEdit(); if (e.key === "Escape") setIpEditMode(false); }}
                  />
                  <button
                    onClick={saveIpEdit}
                    disabled={ipSaving}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ipSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setIpEditMode(false)}
                    className="px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
                {ipError && <span className="text-[11px] text-red-600">{ipError}</span>}
                <span className="text-[10px] text-gray-400">
                  Enter your server&apos;s actual public IP. DNS auto-detection may return CDN IPs.
                </span>
              </div>
            ) : value ? (
              <>
                <div className="flex-1 min-w-0">
                  <code className="block text-xs font-mono text-gray-800 truncate">{value}</code>
                  {hint && <span className="text-[10px] text-gray-400 mt-0.5 block">{hint}</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {editable && (
                    <button
                      onClick={startIpEdit}
                      className="px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                      title="Edit IP address"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => copy(value, key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      copied === key
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs text-gray-400 italic">Not set</span>
                {editable && (
                  <button
                    onClick={startIpEdit}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Set manually
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {displayIp === null && !ipEditMode && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-start gap-2 text-xs text-amber-800">
          <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {websiteUrl ? (
            <span>
              <strong>Could not resolve IP for {hostname ?? websiteUrl}.</strong>{" "}
              <button onClick={startIpEdit} className="underline font-semibold">Enter it manually</button> or check that the domain has a public DNS A record.
            </span>
          ) : (
            <span>
              <strong>IP address not resolved.</strong>{" "}
              {onGoToStep1 ? (
                <>Enter a <button onClick={onGoToStep1} className="underline font-semibold">Website URL in step 1</button>, or <button onClick={startIpEdit} className="underline font-semibold">set the IP manually</button>.</>
              ) : (
                "Enter a Website URL in step 1 — the IP will be resolved automatically from its hostname."
              )}
            </span>
          )}
        </div>
      )}

      {displayIp !== null && !ipEditMode && hostname && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
          IP auto-detected via DNS. If your domain uses a CDN (Cloudflare, etc.), the resolved IP may differ from your actual server IP — use the edit button to correct it.
        </div>
      )}

      {(websiteUrl === null || platformName === null) && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          {[websiteUrl, platformName].filter((v) => v === null).length === 1 ? "1 field is" : "2 fields are"} not set.{" "}
          {onGoToStep1 ? (
            <button onClick={onGoToStep1} className="text-blue-600 hover:underline font-medium">
              Go to step 1
            </button>
          ) : (
            <Link href={`/admin/restaurants/${restaurantId}/onboarding`} className="text-blue-600 hover:underline font-medium">
              Go to step 1
            </Link>
          )}{" "}
          to fill in the missing values.
        </div>
      )}
    </div>
  );
}

// ── Design system components ────────────────────────────────────────────────────

function Spinner({ size = "sm" }: { size?: "xs" | "sm" }) {
  const sz = size === "xs" ? "w-3 h-3" : "w-4 h-4";
  return (
    <svg className={`${sz} animate-spin text-current`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FormField({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="ml-1 text-gray-400 normal-case font-normal tracking-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function FileInput({ accept, value, onChange, placeholder }: {
  accept: string;
  value: File | null;
  onChange: (f: File | null) => void;
  placeholder: string;
}) {
  return (
    <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3.5 cursor-pointer transition-colors ${
      value ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/30"
    }`}>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${value ? "bg-emerald-100" : "bg-white border border-gray-200"}`}>
        {value ? (
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        {value ? (
          <>
            <p className="text-sm font-medium text-emerald-700 truncate">{value.name}</p>
            <p className="text-xs text-emerald-600">{(value.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">{placeholder}</p>
            <p className="text-xs text-gray-400">Click to browse</p>
          </>
        )}
      </div>
    </label>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 mt-2 text-xs text-red-600">
      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function ResultBanner({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${
      result.ok
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-red-50 border-red-200 text-red-800"
    }`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        result.ok ? "bg-emerald-200" : "bg-red-200"
      }`}>
        {result.ok ? (
          <svg className="w-3 h-3 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <span>{result.message}</span>
    </div>
  );
}

function Notice({ variant, children }: { variant: "info" | "warning" | "error"; children: React.ReactNode }) {
  const styles = {
    info:    { wrap: "bg-blue-50 border-blue-200 text-blue-700",   icon: "text-blue-500" },
    warning: { wrap: "bg-amber-50 border-amber-200 text-amber-800", icon: "text-amber-500" },
    error:   { wrap: "bg-red-50 border-red-200 text-red-800",      icon: "text-red-500" },
  }[variant];

  const icons = {
    info: (
      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${styles.icon}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${styles.icon}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${styles.icon}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    ),
  }[variant];

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-sm ${styles.wrap}`}>
      {icons}
      <div>{children}</div>
    </div>
  );
}

function PrimaryButton({ onClick, loading, label }: { onClick: () => void; loading?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {loading && <Spinner size="sm" />}
      {loading ? "Working…" : label}
    </button>
  );
}

function SecondaryButton({ onClick, label, icon }: { onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm"
    >
      {icon}
      {label}
    </button>
  );
}

function GhostButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );
}

function ActionBar({
  onBack, onPrimary, primaryLabel, primaryLoading, onNext, nextLabel,
}: {
  onBack?: () => void;
  onPrimary?: () => void;
  primaryLabel?: string;
  primaryLoading?: boolean;
  onNext?: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {onBack && <GhostButton onClick={onBack} label="← Back" />}
      {onPrimary && primaryLabel && (
        <PrimaryButton onClick={onPrimary} loading={primaryLoading} label={primaryLabel} />
      )}
      {onNext && nextLabel && (
        <button onClick={onNext} className="text-sm text-blue-600 font-medium hover:underline ml-1">
          {nextLabel}
        </button>
      )}
    </div>
  );
}

function ConfigRow({ label, value, sourceLabel, error, isMock }: {
  label: string;
  value: string | null;
  sourceLabel: string | null;
  error: string | null;
  isMock: boolean;
}) {
  if (error) {
    return (
      <div className="flex items-start gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-xl">
        <div className="w-5 h-5 rounded-full bg-red-200 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-800">{label}</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-start gap-3 px-4 py-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="w-5 h-5 rounded-full bg-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">{label}</p>
          <p className="text-xs font-mono text-emerald-700 mt-0.5 break-all">{value}</p>
          {sourceLabel && (
            <p className="text-xs text-emerald-600 mt-0.5">
              {sourceLabel}{isMock ? " (mock mode)" : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl">
      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">Not yet configured</p>
      </div>
    </div>
  );
}
