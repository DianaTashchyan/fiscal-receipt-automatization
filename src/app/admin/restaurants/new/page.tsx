"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LookupResult = {
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

type LookupState =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "notfound"; tin: string }
  | { stage: "error"; message: string }
  | { stage: "done"; result: LookupResult };

export default function NewRestaurantPage() {
  const router = useRouter();
  const [tin, setTin] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ stage: "idle" });

  // Only shown / editable after lookup
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const tinValid = /^\d{8}$/.test(tin.trim());
  const lookupDone = lookup.stage === "done";
  // Save is enabled only when lookup produced name+address (or user edited them in after a failed lookup)
  const canSave = lookupDone && name.trim().length > 0 && address.trim().length > 0;

  function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("admin_token");
  }

  async function handleLookup() {
    if (!tinValid) return;
    setLookup({ stage: "loading" });
    setName("");
    setAddress("");
    setSubmitError("");

    try {
      const res = await fetch(`/api/taxpayer/${tin.trim()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data: LookupResult = await res.json();

      if (!res.ok) {
        setLookup({ stage: "error", message: (data as { error?: string }).error ?? "Lookup failed" });
        return;
      }
      if (data.notFound) {
        setLookup({ stage: "notfound", tin: tin.trim() });
        return;
      }

      setLookup({ stage: "done", result: data });
      setName(data.name ?? "");
      setAddress(data.address ?? "");
    } catch {
      setLookup({ stage: "error", message: "Network error — could not reach the lookup service." });
    }
  }

  async function handleSubmit() {
    if (!canSave) return;
    setSubmitLoading(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/restaurants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ name: name.trim(), tin: tin.trim(), address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Failed to create restaurant"); return; }
      router.push(`/admin/restaurants/${data.id}/onboarding`);
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/admin/restaurants" className="text-sm text-gray-500 hover:text-gray-700">← Restaurants</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Restaurant</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter the company TIN to look up registration data automatically.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">

        {/* Step 1: TIN + Lookup */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            TIN (ՀVHH) <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={tin}
              onChange={(e) => {
                setTin(e.target.value.replace(/\D/g, "").slice(0, 8));
                if (lookup.stage !== "idle") {
                  setLookup({ stage: "idle" });
                  setName("");
                  setAddress("");
                }
              }}
              placeholder="8-digit TIN, e.g. 02938868"
              maxLength={8}
              inputMode="numeric"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={!tinValid || lookup.stage === "loading"}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {lookup.stage === "loading" ? "Looking up…" : "Lookup company"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">8 digits — from your SRC cabinet (ՀNEH)</p>
        </div>

        {/* Loading */}
        {lookup.stage === "loading" && (
          <p className="text-xs text-blue-600 animate-pulse">Querying Armenian company register…</p>
        )}

        {/* Not found */}
        {lookup.stage === "notfound" && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            TIN <code className="font-mono">{lookup.tin}</code> was not found in the Armenian company register.
            Double-check the TIN and try again.
          </div>
        )}

        {/* Network/parse error */}
        {lookup.stage === "error" && (
          <div className="px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
            {lookup.message}
          </div>
        )}

        {/* Success: auto-filled fields */}
        {lookup.stage === "done" && (
          <>
            {/* Source banner */}
            <div className={`px-3 py-2 rounded-lg text-xs border ${
              lookup.result.isMock
                ? "bg-yellow-50 border-yellow-300 text-yellow-800"
                : "bg-green-50 border-green-300 text-green-800"
            }`}>
              {lookup.result.isMock
                ? <><span className="font-mono font-bold">[MOCK]</span> Using mock data — e-register unavailable. Update the fields below with real data before saving.</>
                : "Company data loaded from the Armenian Ministry of Justice register."}
              {!lookup.result.isMock && lookup.result.registrationNumber && (
                <span className="ml-2 opacity-75">
                  Reg. {lookup.result.registrationNumber}
                  {lookup.result.registrationDate ? ` · ${lookup.result.registrationDate}` : ""}
                </span>
              )}
            </div>

            {/* Company name — auto-filled, editable */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Company name <span className="text-red-500">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company name"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">Auto-filled from registry — edit if needed.</span>
            </label>

            {/* Address — auto-filled, editable */}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Legal address <span className="text-red-500">*</span>
              </span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Legal address"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">
                Address is in Armenian script as registered. You may transliterate for internal use.
              </span>
            </label>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
              <strong>CRN is not needed yet.</strong> The Cash Register Number is issued by SRC after your u6 application is approved — enter it later in the onboarding wizard.
            </div>
          </>
        )}

        {submitError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave || submitLoading}
            title={!lookupDone ? "Look up the TIN first" : !name.trim() || !address.trim() ? "Company name and address are required" : undefined}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitLoading ? "Saving…" : lookupDone ? "Save & Start Onboarding →" : "Look up TIN first"}
          </button>
          <Link
            href="/admin/restaurants"
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
