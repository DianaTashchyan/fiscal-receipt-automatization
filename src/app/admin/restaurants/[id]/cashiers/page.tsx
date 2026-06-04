"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Cashier = { id: string; name: string; taxCashierId: string; isDefault: boolean; isActive: boolean; createdAt: string };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function CashiersPage() {
  const { id } = useParams<{ id: string }>();
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", taxCashierId: "", pinCode: "1234", isDefault: false });

  function load() {
    fetch(`/api/restaurants/${id}/cashiers`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Cashier[]) => setCashiers(data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/cashiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) { setSuccess(`Cashier "${data.name}" added.`); setForm({ name: "", taxCashierId: "", pinCode: "1234", isDefault: false }); await load(); }
    else setError(data.error ?? "Failed");
    setSaving(false);
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/restaurants/${id}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← Restaurant</Link>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Cashiers</h1>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
        <div className="flex flex-col gap-2 mb-6">
          {cashiers.length === 0 && <p className="text-gray-400 text-sm">No cashiers yet.</p>}
          {cashiers.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex justify-between items-center">
              <div>
                <span className="font-medium text-gray-900">{c.name}</span>
                <span className="ml-2 text-xs text-gray-500 font-mono">ID: {c.taxCashierId}</span>
                {c.isDefault && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">default</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-900">Add cashier</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Name</span>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Main Cashier"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Tax Cashier ID (from SRC)</span>
            <input value={form.taxCashierId} onChange={(e) => setForm((p) => ({ ...p, taxCashierId: e.target.value }))} required placeholder="3"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">PIN code</span>
            <input value={form.pinCode} onChange={(e) => setForm((p) => ({ ...p, pinCode: e.target.value }))} required placeholder="1234" minLength={4}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
            <span className="text-sm text-gray-700">Set as default</span>
          </label>
        </div>
        <button type="submit" disabled={saving}
          className="self-start px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? "Adding…" : "Add cashier"}
        </button>
      </form>
    </div>
  );
}
