"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Dept = {
  id: string;
  name: string;
  taxDepartmentId: string;
  taxRegime: string;
  isDefault: boolean;
};

const REGIMES: Record<string, string> = {
  "1": "VAT (ԱԱՀ)",
  "2": "VAT-exempt",
  "3": "Turnover tax",
  "7": "Micro business",
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function DepartmentsPage() {
  const { id } = useParams<{ id: string }>();
  const [depts, setDepts]     = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [form, setForm]       = useState({ name: "", taxDepartmentId: "", taxRegime: "1", isDefault: true });

  const load = useCallback(() => {
    fetch(`/api/restaurants/${id}/departments`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Dept[]) => setDepts(data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim())              { setError("Department name is required."); return; }
    if (!form.taxDepartmentId.trim())   { setError("Tax Department ID is required."); return; }
    if (!Number.isInteger(Number(form.taxDepartmentId.trim()))) {
      setError("Tax Department ID must be a whole number."); return;
    }
    if (!["1", "2", "3", "7"].includes(form.taxRegime)) {
      setError("Select a valid tax regime."); return;
    }

    setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/departments`, {
      method:  "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name:            form.name.trim(),
        taxDepartmentId: form.taxDepartmentId.trim(),
        taxRegime:       Number(form.taxRegime),
        isDefault:       form.isDefault,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(`Department "${data.name}" added (ID: ${data.taxDepartmentId}, ${REGIMES[data.taxRegime] ?? `Regime ${data.taxRegime}`}).`);
      setForm({ name: "", taxDepartmentId: "", taxRegime: "1", isDefault: true });
      await load();
    } else {
      setError(data.error ?? "Failed to add department");
    }
    setSaving(false);
  }

  async function syncToSrc() {
    setSyncMsg("Sending to SRC…");
    const res = await fetch("/api/src/configure-departments", {
      method:  "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        restaurantId: id,
        departments: depts.map((d) => ({
          dep:       Number(d.taxDepartmentId),
          taxRegime: Number(d.taxRegime),
        })),
      }),
    });
    const data = await res.json();
    setSyncMsg(
      res.ok
        ? "Departments synced to SRC successfully."
        : `Sync failed: ${(data.error as string) ?? "Unknown error"}`
    );
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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tax Departments</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure tax departments and regimes. The regime determines how VAT is applied on fiscal receipts.
        </p>
      </div>

      {/* Existing departments */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          Loading departments…
        </div>
      ) : depts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No departments yet</h3>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            Add at least one department with the correct tax regime. This determines how receipts are fiscalized.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {depts.length} department{depts.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={syncToSrc}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync to SRC
            </button>
          </div>
          {syncMsg && (
            <div className={`px-5 py-2.5 text-xs border-b ${
              syncMsg.includes("successfully") ? "bg-emerald-50 text-emerald-700 border-emerald-100" : syncMsg.startsWith("Sync failed") ? "bg-red-50 text-red-700 border-red-100" : "bg-blue-50 text-blue-700 border-blue-100"
            }`}>
              {syncMsg}
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tax Regime</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {depts.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{d.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">{d.taxDepartmentId}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-700">{REGIMES[d.taxRegime] ?? `Regime ${d.taxRegime}`}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {d.isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        Default
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add department form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Add Department</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Enter the department details. The tax regime must match your company&apos;s SRC classification.
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
                Department Name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setError(""); }}
                placeholder="e.g. Main Department"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Tax Department ID <span className="text-red-400">*</span>
              </label>
              <input
                value={form.taxDepartmentId}
                onChange={(e) => { setForm((p) => ({ ...p, taxDepartmentId: e.target.value })); setError(""); }}
                placeholder="e.g. 1"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-1">Integer ID assigned by SRC to this department</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Tax Regime <span className="text-red-400">*</span>
              </label>
              <select
                value={form.taxRegime}
                onChange={(e) => { setForm((p) => ({ ...p, taxRegime: e.target.value })); setError(""); }}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                {Object.entries(REGIMES).map(([v, l]) => (
                  <option key={v} value={v}>{v} — {l}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Must match your company&apos;s SRC tax classification</p>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 font-medium">Set as default department</span>
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
                  Saving…
                </>
              ) : "Add Department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
