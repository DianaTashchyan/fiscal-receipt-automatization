"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Product = { id: string; name: string; goodCode: string; adgCode: string; unit: string; price: string | null; isVariablePrice: boolean; department: { name: string; taxDepartmentId: string } };
type Department = { id: string; name: string; taxDepartmentId: string };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function ProductsPage() {
  const { id } = useParams<{ id: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", goodCode: "", adgCode: "", unit: "piece", price: "", departmentId: "", externalProductId: "" });

  function load() {
    Promise.all([
      fetch(`/api/restaurants/${id}/products`, { headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.ok ? r.json() : []),
      fetch(`/api/restaurants/${id}/departments`, { headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.ok ? r.json() : []),
    ]).then(([prods, depts]: [Product[], Department[]]) => {
      setProducts(prods);
      setDepts(depts);
      if (depts[0]) setForm((p) => ({ ...p, departmentId: depts[0].id }));
    }).catch(() => undefined).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    });
    const data = await res.json();
    if (res.ok) { setSuccess(`Product "${data.name}" added.`); setForm((p) => ({ ...p, name: "", goodCode: "", adgCode: "", price: "", externalProductId: "" })); await load(); }
    else setError(data.error ?? "Failed");
    setSaving(false);
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/admin/restaurants/${id}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← Restaurant</Link>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Products</h1>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
        <>
          {products.length > 0 && (
            <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Name", "Good Code", "ADG Code", "Unit", "Price", "Department"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 text-gray-900">{p.name}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 text-xs">{p.goodCode}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-600 text-xs">{p.adgCode}</td>
                      <td className="px-3 py-2.5 text-gray-600">{p.unit}</td>
                      <td className="px-3 py-2.5 text-gray-900">{p.price ? `${p.price} ֏` : "Variable"}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs">{p.department.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-gray-900">Add product</h2>
            {depts.length === 0 && (
              <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-3">
                ⚠ No departments yet. <Link href={`/admin/restaurants/${id}/departments`} className="underline">Add a department first</Link>.
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-600">Product name (max 50 chars)</span>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required maxLength={50} placeholder="Margherita Pizza"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Good code (SRC list)</span>
                <input value={form.goodCode} onChange={(e) => setForm((p) => ({ ...p, goodCode: e.target.value }))} required placeholder="2106-90"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">ADG code (ԱՏԳ)</span>
                <input value={form.adgCode} onChange={(e) => setForm((p) => ({ ...p, adgCode: e.target.value }))} required placeholder="2106"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Unit</span>
                <input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} required placeholder="piece"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Price (AMD)</span>
                <input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} required type="number" placeholder="3500"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">External product ID (POS)</span>
                <input value={form.externalProductId} onChange={(e) => setForm((p) => ({ ...p, externalProductId: e.target.value }))} placeholder="Optional POS SKU"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Department</span>
                <select value={form.departmentId} onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))} required
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name} (dep {d.taxDepartmentId})</option>)}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving || depts.length === 0}
              className="self-start px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? "Adding…" : "Add product"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
