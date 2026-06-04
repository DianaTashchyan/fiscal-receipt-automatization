"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Dept = { id: string; name: string; taxDepartmentId: string; taxRegime: string; isDefault: boolean };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }
const REGIMES: Record<string, string> = { "1": "VAT (ԱԱՀ)", "2": "VAT-exempt", "3": "Turnover", "7": "Micro" };

export default function DepartmentsPage() {
  const { id } = useParams<{ id: string }>();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [form, setForm] = useState({ name: "Main", taxDepartmentId: "1", taxRegime: "1", isDefault: true });

  function load() {
    fetch(`/api/restaurants/${id}/departments`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Dept[]) => setDepts(data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ...form, taxRegime: Number(form.taxRegime) }),
    });
    const data = await res.json();
    if (res.ok) { setSuccess(`Department "${data.name}" saved to DB.`); await load(); }
    else setError(data.error ?? "Failed");
    setSaving(false);
  }

  async function syncToSrc() {
    setSyncMsg("Sending to SRC…");
    const res = await fetch("/api/src/configure-departments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        restaurantId: id,
        departments: depts.map((d) => ({ dep: Number(d.taxDepartmentId), taxRegime: Number(d.taxRegime) })),
      }),
    });
    const data = await res.json();
    setSyncMsg(res.ok ? "✓ Sent to SRC successfully." : `✗ ${data.error ?? data.success === false ? "SRC error" : "Failed"}`);
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/restaurants/${id}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← Restaurant</Link>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Tax Departments</h1>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
        <div className="mb-4">
          {depts.length === 0 ? <p className="text-gray-400 text-sm mb-3">No departments yet.</p> : (
            <div className="flex flex-col gap-2 mb-3">
              {depts.map((d) => (
                <div key={d.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-900">{d.name}</span>
                    <span className="ml-2 text-xs text-gray-500 font-mono">dep {d.taxDepartmentId}</span>
                    <span className="ml-2 text-xs text-gray-500">{REGIMES[d.taxRegime] ?? `regime ${d.taxRegime}`}</span>
                    {d.isDefault && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">default</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {depts.length > 0 && (
            <div>
              <button onClick={syncToSrc} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                Sync all to SRC
              </button>
              {syncMsg && <p className={`mt-2 text-sm ${syncMsg.startsWith("✓") ? "text-green-600" : syncMsg.startsWith("✗") ? "text-red-600" : "text-gray-500"}`}>{syncMsg}</p>}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-900">Add department</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 col-span-3">
            <span className="text-xs font-medium text-gray-600">Department name</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Dept number</span>
            <input value={form.taxDepartmentId} onChange={(e) => setForm((p) => ({ ...p, taxDepartmentId: e.target.value }))} required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Tax regime</span>
            <select value={form.taxRegime} onChange={(e) => setForm((p) => ({ ...p, taxRegime: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {Object.entries(REGIMES).map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-4">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
            <span className="text-sm text-gray-700">Default</span>
          </label>
        </div>
        <button type="submit" disabled={saving}
          className="self-start px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? "Saving…" : "Add department"}
        </button>
      </form>
    </div>
  );
}
