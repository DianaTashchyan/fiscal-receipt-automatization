"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Cashier = {
  id: string;
  name: string;
  taxCashierId: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function CashiersPage() {
  const { id } = useParams<{ id: string }>();
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [form, setForm] = useState({ name: "", taxCashierId: "", pinCode: "", isDefault: true });

  const load = useCallback(() => {
    fetch(`/api/restaurants/${id}/cashiers`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Cashier[]) => setCashiers(data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim())         { setError("Cashier name is required."); return; }
    if (!form.taxCashierId.trim()) { setError("SRC Cashier ID is required. Find it in SRC cabinet → ECR page → Cashiers."); return; }
    if (form.pinCode.length < 4)   { setError("PIN must be at least 4 characters."); return; }

    setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/cashiers`, {
      method:  "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name:        form.name.trim(),
        taxCashierId: form.taxCashierId.trim(),
        pinCode:     form.pinCode,
        isDefault:   form.isDefault,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(`Cashier "${data.name}" added (SRC ID: ${data.taxCashierId}).`);
      setForm({ name: "", taxCashierId: "", pinCode: "", isDefault: true });
      await load();
    } else {
      setError(data.error ?? "Failed to add cashier");
    }
    setSaving(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/admin/restaurants/${id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Restaurant
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Cashiers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Each cashier requires an SRC-assigned ID from your SRC cabinet — ECR page → Cashiers column.
        </p>
      </div>

      {/* Existing cashiers */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          Loading cashiers…
        </div>
      ) : cashiers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No cashiers yet</h3>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            Add at least one cashier with their SRC-assigned ID. The default cashier is used for all receipt creation.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {cashiers.length} cashier{cashiers.length !== 1 ? "s" : ""}
            </p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SRC Cashier ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cashiers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">{c.taxCashierId}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    {c.isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add cashier form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Add Cashier</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Enter the values from your SRC cabinet. The SRC Cashier ID is shown in ECR page → Cashiers section.
          </p>
        </div>
        <form onSubmit={handleAdd} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Cashier Name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setError(""); }}
                placeholder="e.g. Main Cashier"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                SRC Cashier ID <span className="text-red-400">*</span>
              </label>
              <input
                value={form.taxCashierId}
                onChange={(e) => { setForm((p) => ({ ...p, taxCashierId: e.target.value })); setError(""); }}
                placeholder="e.g. 1"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-1">From SRC cabinet → ECR page → Cashiers column</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                PIN <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={form.pinCode}
                onChange={(e) => { setForm((p) => ({ ...p, pinCode: e.target.value })); setError(""); }}
                placeholder="Min 4 characters"
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 font-medium">Set as default cashier</span>
              </label>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding…
                </>
              ) : "Add Cashier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
