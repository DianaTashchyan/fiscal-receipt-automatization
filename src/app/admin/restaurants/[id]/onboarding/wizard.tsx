"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

type Cashier    = { id: string; name: string; taxCashierId: string; isDefault: boolean };
type Department = { id: string; name: string; taxDepartmentId: string; taxRegime: string };
type Product    = { id: string; name: string };

type RestaurantData = {
  id: string; name: string; tin: string; crn: string; address: string;
  hasCsr: boolean; csrCreatedAt: string | null;
  hasCert: boolean; certConfiguredAt: string | null;
  onboardingStep: number;
  cashiers: Cashier[]; departments: Department[]; products: Product[];
};

const STEPS = [
  { n: 1, title: "Company Info",             icon: "🏢" },
  { n: 2, title: "Generate CSR",             icon: "🔑" },
  { n: 3, title: "Submit CSR to SRC",        icon: "📤" },
  { n: 4, title: "Upload Certificate",       icon: "🔒" },
  { n: 5, title: "Test Connection",          icon: "🔌" },
  { n: 6, title: "Add Cashier",              icon: "👤" },
  { n: 7, title: "Configure Departments",    icon: "🏷" },
  { n: 8, title: "Activate ECR",             icon: "⚡" },
  { n: 9, title: "Add Products & API Key",   icon: "📦" },
];

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

async function api(url: string, method = "GET", body?: unknown) {
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

export default function OnboardingWizard({ restaurant }: { restaurant: RestaurantData }) {
  const initialStep = Math.max(1, Math.min(restaurant.onboardingStep + 1, 9));
  const [step, setStep] = useState(restaurant.onboardingStep >= 9 ? 9 : initialStep);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [csrPem, setCsrPem] = useState<string | null>(null);

  // Step 4 form state
  const [certPassword, setCertPassword] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certError, setCertError] = useState("");

  // Step 6 cashier form
  const [cashierName, setCashierName] = useState("");
  const [cashierTaxId, setCashierTaxId] = useState("");
  const [cashierPin, setCashierPin] = useState("1234");

  // Step 7 departments
  const [deptName, setDeptName] = useState("Main");
  const [deptTaxId, setDeptTaxId] = useState("1");
  const [deptRegime, setDeptRegime] = useState("1");

  // Step 9 product form
  const [prodName, setProdName] = useState("");
  const [prodGoodCode, setProdGoodCode] = useState("");
  const [prodAdgCode, setProdAdgCode] = useState("");
  const [prodUnit, setProdUnit] = useState("piece");
  const [prodPrice, setProdPrice] = useState("");
  const [prodDeptId, setProdDeptId] = useState(restaurant.departments[0]?.id ?? "");

  const _done = useCallback(() => setResult(null), []);

  async function goTo(n: number) {
    setStep(n);
    setResult(null);
  }

  // ---- Step 2: Generate CSR ----
  async function doGenerateCsr() {
    setLoading(true);
    setResult(null);
    const { ok, data } = await api(`/api/restaurants/${restaurant.id}/generate-csr`, "POST");
    if (ok) {
      setCsrPem(data.csrPem);
      setResult({ ok: true, message: "CSR generated! Download it below." });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 2 });
    } else {
      setResult({ ok: false, message: data.error ?? "Failed to generate CSR" });
    }
    setLoading(false);
  }

  function downloadCsr() {
    const text = csrPem ?? "";
    const blob = new Blob([text], { type: "application/pkcs10" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${restaurant.tin}.csr`; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsrFromServer() {
    window.open(`/api/restaurants/${restaurant.id}/csr`, "_blank");
  }

  function downloadPrivateKey() {
    window.open(`/api/restaurants/${restaurant.id}/csr?key=1`, "_blank");
  }

  // ---- Step 4: Upload certificate ----
  async function doUploadCert() {
    setCertError("");
    if (!certFile) { setCertError("Select a .p12 file"); return; }
    if (certFile.size > 1_048_576) { setCertError("File must be smaller than 1 MB"); return; }
    if (!certPassword.trim()) { setCertError("Certificate password is required"); return; }
    if (!certFile.name.match(/\.(p12|pfx)$/i)) { setCertError("File must be a .p12 or .pfx certificate"); return; }

    setLoading(true);
    setResult(null);
    const buffer = await certFile.arrayBuffer();
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    const { ok, data } = await api(`/api/restaurants/${restaurant.id}/src-config`, "POST", {
      certBase64, certPassword,
    });
    if (ok) {
      setResult({ ok: true, message: "Certificate uploaded and validated." });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 4 });
    } else {
      setResult({ ok: false, message: data.error ?? "Certificate upload failed" });
    }
    setLoading(false);
  }

  // ---- Step 5: Test connection ----
  async function doTestConnection() {
    setLoading(true);
    setResult(null);
    const { ok, data } = await api("/api/src/check-connection", "POST", {
      crn: restaurant.crn, restaurantId: restaurant.id,
    });
    if (ok && data.result?.code === 0) {
      setResult({ ok: true, message: "Connection successful! SRC is reachable." });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 5 });
    } else {
      setResult({ ok: false, message: data.error ?? data.result?.message ?? "Connection failed" });
    }
    setLoading(false);
  }

  // ---- Step 6: Add cashier ----
  async function doAddCashier() {
    if (!cashierName || !cashierTaxId) {
      setResult({ ok: false, message: "Name and Tax Cashier ID are required" }); return;
    }
    setLoading(true);
    setResult(null);
    const { ok, data } = await api(`/api/restaurants/${restaurant.id}/cashiers`, "POST", {
      name: cashierName, taxCashierId: cashierTaxId, pinCode: cashierPin, isDefault: true,
    });
    if (ok) {
      setResult({ ok: true, message: `Cashier "${cashierName}" (ID: ${cashierTaxId}) added.` });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 6 });
    } else {
      setResult({ ok: false, message: data.error ?? "Failed to add cashier" });
    }
    setLoading(false);
  }

  // ---- Step 7: Configure departments ----
  async function doConfigureDepts() {
    if (!deptTaxId) { setResult({ ok: false, message: "Department number required" }); return; }
    setLoading(true);
    setResult(null);

    // 1) Save to local DB
    const { ok: dbOk, data: dbData } = await api(
      `/api/restaurants/${restaurant.id}/departments`, "POST",
      { name: deptName, taxDepartmentId: deptTaxId, taxRegime: Number(deptRegime), isDefault: true },
    );
    if (!dbOk) { setResult({ ok: false, message: dbData.error ?? "Failed to save department" }); setLoading(false); return; }

    // 2) Send to SRC
    const { ok, data } = await api("/api/src/configure-departments", "POST", {
      crn: restaurant.crn, restaurantId: restaurant.id,
      departments: [{ dep: Number(deptTaxId), taxRegime: Number(deptRegime) }],
    });
    if (ok) {
      setResult({ ok: true, message: `Department "${deptName}" registered with SRC.` });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 7 });
    } else {
      setResult({ ok: false, message: `Saved to DB but SRC call failed: ${data.error ?? "Unknown error"}` });
    }
    setLoading(false);
  }

  // ---- Step 8: Activate ----
  async function doActivate() {
    setLoading(true);
    setResult(null);
    const { ok, data } = await api("/api/src/activate", "POST", {
      crn: restaurant.crn, restaurantId: restaurant.id,
    });
    if (ok) {
      setResult({ ok: true, message: "ECR activated! You can now print real receipts." });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 8 });
    } else {
      setResult({ ok: false, message: data.error ?? "Activation failed" });
    }
    setLoading(false);
  }

  // ---- Step 9: Add product ----
  async function doAddProduct() {
    if (!prodName || !prodGoodCode || !prodAdgCode || !prodDeptId || !prodPrice) {
      setResult({ ok: false, message: "All product fields are required" }); return;
    }
    setLoading(true);
    setResult(null);
    const { ok, data } = await api(`/api/restaurants/${restaurant.id}/products`, "POST", {
      name: prodName, goodCode: prodGoodCode, adgCode: prodAdgCode,
      unit: prodUnit, price: Number(prodPrice), departmentId: prodDeptId,
    });
    if (ok) {
      setResult({ ok: true, message: `Product "${prodName}" added.` });
      await api(`/api/restaurants/${restaurant.id}`, "PATCH", { srcOnboardingStep: 9 });
    } else {
      setResult({ ok: false, message: data.error ?? "Failed to add product" });
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href={`/admin/restaurants/${restaurant.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {restaurant.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">SRC Onboarding Wizard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Follow these steps to connect this restaurant to the Armenian SRC tax system.</p>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s) => (
          <button key={s.n} onClick={() => goTo(s.n)}
            className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              step === s.n
                ? "bg-blue-600 text-white border-blue-600"
                : restaurant.onboardingStep >= s.n
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
            }`}>
            <span>{s.icon}</span>
            <span>{s.n}</span>
          </button>
        ))}
      </div>

      {/* Active step panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Step {step}: {STEPS[step - 1].title}
        </h2>

        {/* ---- Step 1: Company info summary ---- */}
        {step === 1 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">Verify that TIN and CRN are correct before proceeding.</p>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <InfoRow label="Name" value={restaurant.name} />
              <InfoRow label="TIN" value={restaurant.tin} mono />
              <InfoRow label="CRN" value={restaurant.crn} mono />
              <InfoRow label="Address" value={restaurant.address} />
            </dl>
            <div className="flex gap-2">
              <Link href={`/admin/restaurants/${restaurant.id}`}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Edit info
              </Link>
              <StepButton onClick={() => goTo(2)} label="TIN/CRN confirmed →" />
            </div>
          </div>
        )}

        {/* ---- Step 2: Generate CSR ---- */}
        {step === 2 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Generate an RSA-2048 key pair and Certificate Signing Request (CSR).
              The CSR subject will be set to the SRC-mandated format using your TIN.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-600 mb-4">
              CN={restaurant.tin} Tin, OU={restaurant.tin} Tin, O={restaurant.tin} Tin, L=Yerevan, ST=Yerevan, C=AM
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              ⚠ Re-generating a CSR creates a new private key. Any previously uploaded .p12 certificate that used the old key will stop working.
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2 flex-wrap">
              <StepButton onClick={doGenerateCsr} loading={loading}
                label={restaurant.hasCsr ? "Re-generate CSR" : "Generate CSR"} />
              {(csrPem || restaurant.hasCsr) && (
                <>
                  <button onClick={csrPem ? downloadCsr : downloadCsrFromServer}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                    ⬇ Download CSR (.csr)
                  </button>
                  <button onClick={downloadPrivateKey}
                    className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                    ⬇ Download Private Key (.pem)
                  </button>
                </>
              )}
            </div>
            {(csrPem || restaurant.hasCsr) && (
              <button onClick={() => goTo(3)} className="mt-4 text-sm text-blue-600 hover:underline">
                CSR downloaded → Next step
              </button>
            )}
          </div>
        )}

        {/* ---- Step 3: Submit CSR instructions ---- */}
        {step === 3 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Submit the CSR file to the SRC (State Revenue Committee) u6 application to get your signed certificate.
            </p>
            <ol className="list-decimal list-inside flex flex-col gap-2 text-sm text-gray-700 mb-4">
              <li>Log in to <a href="https://ecrm.taxservice.am" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">ecrm.taxservice.am</a> (ՀNEH cabinet)</li>
              <li>Go to <strong>Reports → Application u6</strong> (ՀDM registration)</li>
              <li>In section <strong>5.2 &ldquo;IP address&rdquo;</strong>, enter the server&apos;s outbound IP address</li>
              <li>In <strong>&ldquo;Certificate signing request&rdquo;</strong>, upload the <code className="bg-gray-100 px-1 rounded">{restaurant.tin}.csr</code> file</li>
              <li>Submit the form. SRC will approve and generate the signed certificate</li>
              <li>Download the <code className="bg-gray-100 px-1 rounded">{restaurant.tin}.crt</code> file and the CA root</li>
            </ol>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-4">
              <strong>Convert to .p12:</strong> Once you have the .crt and the private key you downloaded in step 2,
              run: <code className="block mt-1 bg-blue-100 px-2 py-1 rounded font-mono">
                openssl pkcs12 -export -in {restaurant.tin}.crt -inkey {restaurant.tin}.key.pem -out {restaurant.tin}.p12
              </code>
              Or use the included script: <code className="bg-blue-100 px-1 rounded">scripts/convert-jks-to-p12.sh</code>
            </div>
            <div className="flex gap-2">
              <button onClick={() => goTo(2)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                ← Back
              </button>
              <StepButton onClick={() => goTo(4)} label="Certificate ready → Upload now" />
            </div>
          </div>
        )}

        {/* ---- Step 4: Upload certificate ---- */}
        {step === 4 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Upload the PKCS#12 (.p12) certificate bundle. It will be validated and stored encrypted.
            </p>
            {restaurant.hasCert && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Certificate already uploaded ({restaurant.certConfiguredAt ? new Date(restaurant.certConfiguredAt).toLocaleDateString() : "—"}). You can replace it below.
              </div>
            )}
            <div className="flex flex-col gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">.p12 Certificate file</span>
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
            {certError && <p className="text-sm text-red-600 mb-3">{certError}</p>}
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(3)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doUploadCert} loading={loading} label="Upload & Validate" />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(5)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Certificate OK → Next step →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 5: Test connection ---- */}
        {step === 5 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Test the mutual TLS connection to SRC. This verifies that the certificate is accepted and your server&apos;s IP is registered.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 mb-4">
              <strong>CRN:</strong> {restaurant.crn}
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(4)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doTestConnection} loading={loading} label="Test SRC connection" />
            </div>
            {result?.ok && (
              <button onClick={() => goTo(6)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Connection OK → Next step →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 6: Add cashier ---- */}
        {step === 6 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Add the cashier registered in the SRC cabinet. The Tax Cashier ID comes from the u6 application.
            </p>
            {restaurant.cashiers.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Cashier(s) already added: {restaurant.cashiers.map((c) => `${c.name} (ID: ${c.taxCashierId})`).join(", ")}
              </div>
            )}
            <div className="flex flex-col gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Cashier name</span>
                <input value={cashierName} onChange={(e) => setCashierName(e.target.value)} placeholder="e.g. Main Cashier"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Tax Cashier ID (from SRC cabinet)</span>
                <input value={cashierTaxId} onChange={(e) => setCashierTaxId(e.target.value)} placeholder="e.g. 3"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                <span className="text-xs text-gray-400">ՀNEH → ECR page → Cashiers section</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">PIN code (for local login)</span>
                <input value={cashierPin} onChange={(e) => setCashierPin(e.target.value)} placeholder="4+ digits"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" maxLength={12} />
              </label>
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(5)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doAddCashier} loading={loading} label="Add cashier" />
              {restaurant.cashiers.length > 0 && (
                <button onClick={() => goTo(7)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already added) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(7)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Cashier added → Next step →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 7: Configure departments ---- */}
        {step === 7 && (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Configure tax departments in SRC. Each department has a number and a tax regime.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-3">
              Tax regimes: 1 = VAT (ԱԱՀ), 2 = VAT-exempt, 3 = Turnover tax, 7 = Micro enterprise
            </div>
            {restaurant.departments.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ Department(s) already configured: {restaurant.departments.map((d) => `${d.name} (dep ${d.taxDepartmentId}, regime ${d.taxRegime})`).join(", ")}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Department name</span>
                <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Main Hall"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Dept number (dep)</span>
                <input value={deptTaxId} onChange={(e) => setDeptTaxId(e.target.value)} placeholder="1"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Tax regime</span>
                <select value={deptRegime} onChange={(e) => setDeptRegime(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="1">1 — VAT</option>
                  <option value="2">2 — VAT-exempt</option>
                  <option value="3">3 — Turnover</option>
                  <option value="7">7 — Micro</option>
                </select>
              </label>
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(6)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doConfigureDepts} loading={loading} label="Save & send to SRC" />
              {restaurant.departments.length > 0 && (
                <button onClick={() => goTo(8)} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                  Skip (already configured) →
                </button>
              )}
            </div>
            {result?.ok && (
              <button onClick={() => goTo(8)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Departments configured → Next step →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 8: Activate ---- */}
        {step === 8 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Activate the ECR to transition it from &quot;Current&quot; (Ընthаndig) to &quot;Active&quot; (Garawogh) status.
              This must be done once before issuing any real receipts.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 mb-4">
              <strong>CRN:</strong> {restaurant.crn} · <strong>Mode:</strong>{" "}
              {process.env.NODE_ENV ? "real" : "mock"}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
              ⚠ Only call activate once. If the ECR is already active (error 195/196 from SRC), this step is already complete.
            </div>
            <ResultBanner result={result} />
            <div className="flex gap-2">
              <button onClick={() => goTo(7)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doActivate} loading={loading} label="Activate ECR" />
            </div>
            {(result?.ok || result?.message?.includes("already") || result?.message?.includes("195") || result?.message?.includes("196")) && (
              <button onClick={() => goTo(9)} className="mt-3 text-sm text-blue-600 hover:underline block">
                Next step →
              </button>
            )}
          </div>
        )}

        {/* ---- Step 9: Products + API Key ---- */}
        {step === 9 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Add at least one product (with its SRC good code and ADG code), then create an API key for your POS system.
            </p>

            {restaurant.products.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                ✓ {restaurant.products.length} product(s) already added.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-sm font-medium text-gray-700">Product name (max 50 chars)</span>
                <input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="e.g. Margherita Pizza"
                  maxLength={50}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Good code (from SRC good list)</span>
                <input value={prodGoodCode} onChange={(e) => setProdGoodCode(e.target.value)} placeholder="e.g. 2106-90"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">ADG code (ԱՏԳ)</span>
                <input value={prodAdgCode} onChange={(e) => setProdAdgCode(e.target.value)} placeholder="e.g. 2106"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Unit</span>
                <input value={prodUnit} onChange={(e) => setProdUnit(e.target.value)} placeholder="piece"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-gray-700">Price (AMD)</span>
                <input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} placeholder="3500" type="number"
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
            <div className="flex gap-2 mb-6">
              <button onClick={() => goTo(8)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">← Back</button>
              <StepButton onClick={doAddProduct} loading={loading} label="Add product" />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600 mb-3">
                Create an API key to connect your POS system to the receipt API.
              </p>
              <ApiKeySection restaurantId={restaurant.id} />
            </div>

            {restaurant.products.length > 0 && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-5 text-center">
                <div className="text-3xl mb-2">🎉</div>
                <h3 className="font-semibold text-green-900 mb-1">Onboarding Complete!</h3>
                <p className="text-sm text-green-700 mb-3">
                  The restaurant is ready to issue fiscal receipts.
                  Use the API key to connect your POS system.
                </p>
                <Link href={`/admin/restaurants/${restaurant.id}`}
                  className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  Go to restaurant dashboard →
                </Link>
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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium text-gray-900 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </>
  );
}

function ApiKeySection({ restaurantId }: { restaurantId: string }) {
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/restaurants/${restaurantId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ label: "POS Terminal" }),
    });
    const data = await res.json();
    if (res.ok) setKey(data.key);
    else setError(data.error ?? "Failed");
    setLoading(false);
  }

  async function copy() {
    if (key) { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {key ? (
        <div className="bg-gray-900 rounded-lg p-3 flex items-center gap-2">
          <code className="text-green-400 text-xs font-mono flex-1 break-all">{key}</code>
          <button onClick={copy} className="shrink-0 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : (
        <button onClick={generate} disabled={loading}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-60">
          {loading ? "Generating…" : "Generate API Key"}
        </button>
      )}
      {key && (
        <p className="text-xs text-amber-600 mt-2">
          ⚠ Copy this key now — it will not be shown again. Use it as the <code>X-Api-Key</code> header.
        </p>
      )}
    </div>
  );
}
