"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewRestaurantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", tin: "", crn: "", address: "" });

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create restaurant"); return; }
      router.push(`/admin/restaurants/${data.id}/onboarding`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/admin/restaurants" className="text-sm text-gray-500 hover:text-gray-700">← Restaurants</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Restaurant</h1>
        <p className="text-gray-500 text-sm mt-1">After saving, you will be taken to the SRC onboarding wizard.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Restaurant name <span className="text-red-500">*</span></span>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required
            placeholder="e.g. Glana Restaurant"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">TIN (ՀVHH) <span className="text-red-500">*</span></span>
          <input value={form.tin} onChange={(e) => update("tin", e.target.value)} required
            placeholder="8-digit taxpayer ID, e.g. 00493113" maxLength={8}
            pattern="\d{8}" title="8-digit number"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400">From SRC cabinet → company profile (ՀNEH)</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">CRN — Cash Register Number <span className="text-red-500">*</span></span>
          <input value={form.crn} onChange={(e) => update("crn", e.target.value)} required
            placeholder="e.g. 52014201 (from SRC u6 application)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400">From ՀNEH → ECR list → Registration number</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Address <span className="text-red-500">*</span></span>
          <input value={form.address} onChange={(e) => update("address", e.target.value)} required
            placeholder="e.g. Yerevan, Kentron, Tigranyan 5"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>

        <div className="flex gap-3 mt-2">
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {loading ? "Saving…" : "Save & Start Onboarding →"}
          </button>
          <Link href="/admin/restaurants"
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
