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

export default function NewRestaurantPage() {
  const router = useRouter();
  const [tin, setTin] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function getToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("admin_token");
  }

  async function handleLookup() {
    const trimmed = tin.trim();
    if (!/^\d{8}$/.test(trimmed)) {
      setLookupError("TIN must be exactly 8 digits.");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);

    try {
      const res = await fetch(`/api/taxpayer/${trimmed}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data: LookupResult = await res.json();

      if (!res.ok) {
        setLookupError((data as { error?: string }).error ?? "Lookup failed");
        setLookupLoading(false);
        return;
      }

      if (data.notFound) {
        setLookupError(`TIN ${trimmed} was not found in the Armenian company register. Check the TIN and try again.`);
        setLookupLoading(false);
        return;
      }

      setLookupResult(data);
      if (data.name) setName(data.name);
      if (data.address) setAddress(data.address);
      if (data.error) setLookupError(data.error);
    } catch {
      setLookupError("Network error — could not reach the taxpayer lookup service.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setSubmitError("Company name is required."); return; }
    if (!address.trim()) { setSubmitError("Address is required."); return; }

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

  const tinValid = /^\d{8}$/.test(tin.trim());
  const canCreate = tinValid && name.trim() && address.trim();

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/admin/restaurants" className="text-sm text-gray-500 hover:text-gray-700">
          ← Restaurants
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Restaurant</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter the TIN to look up company data from the Armenian company register, then start the SRC onboarding wizard.
          CRN is not needed at this stage.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-5">

        {/* TIN + lookup */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            TIN (ՀVHH) <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={tin}
              onChange={(e) => { setTin(e.target.value); setLookupResult(null); setLookupError(""); }}
              placeholder="8-digit taxpayer ID, e.g. 02938868"
              maxLength={8}
              pattern="\d{8}"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={!tinValid || lookupLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {lookupLoading ? "Looking up…" : "Lookup company"}
            </button>
          </div>
          {lookupLoading && (
            <p className="text-xs text-gray-500 mt-1 animate-pulse">Querying e-register.moj.am…</p>
          )}
          <p className="text-xs text-gray-400 mt-1">From SRC cabinet → company profile</p>
        </div>

        {/* Error */}
        {lookupError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {lookupError}
          </div>
        )}

        {/* Success banner + registry data */}
        {lookupResult && !lookupResult.notFound && (
          <div className={`px-3 py-2 rounded-lg text-xs border ${
            lookupResult.isMock
              ? "bg-yellow-50 border-yellow-300 text-yellow-800"
              : "bg-green-50 border-green-300 text-green-800"
          }`}>
            {lookupResult.isMock
              ? <><span className="font-mono font-bold">[MOCK]</span> {lookupResult.error ?? "Using mock data."}</>
              : "Company data loaded from Armenian Ministry of Justice register."}
            {(lookupResult.registrationNumber || lookupResult.registrationDate) && (
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] opacity-80">
                {lookupResult.registrationNumber && (
                  <><dt>Reg. number</dt><dd className="font-mono">{lookupResult.registrationNumber}</dd></>
                )}
                {lookupResult.registrationDate && (
                  <><dt>Reg. date</dt><dd>{lookupResult.registrationDate}</dd></>
                )}
              </dl>
            )}
          </div>
        )}

        {/* Editable name */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Company name <span className="text-red-500">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. «GLANA» LLC"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {lookupResult?.isMock && (
            <span className="text-xs text-yellow-600">Pre-filled from MOCK — update with your real company name.</span>
          )}
        </label>

        {/* Editable address */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">
            Legal address <span className="text-red-500">*</span>
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Yerevan, Byron St. 1/1"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
          <strong>CRN is not needed yet.</strong> The Cash Register Number is issued by SRC only after your u6 application is approved.
          You will enter it in the onboarding wizard after the CSR step.
        </div>

        {submitError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canCreate || submitLoading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {submitLoading ? "Saving…" : "Save & Start Onboarding →"}
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
