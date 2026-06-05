"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  price: string | null;
  isVariablePrice: boolean;
  department: { name: string; taxDepartmentId: string };
};
type Department = { id: string; name: string; taxDepartmentId: string };

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function ProductsPage() {
  const { id } = useParams<{ id: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [depts, setDepts]       = useState<Department[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [form, setForm] = useState({
    name: "", goodCode: "", adgCode: "", unit: "piece", price: "", departmentId: "", externalProductId: "",
  });

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/restaurants/${id}/products`,    { headers: authHeaders() }).then((r) => r.ok ? r.json() : []),
      fetch(`/api/restaurants/${id}/departments`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : []),
    ]).then(([prods, dps]: [Product[], Department[]]) => {
      setProducts(prods);
      setDepts(dps);
      if (dps[0]) setForm((p) => ({ ...p, departmentId: dps[0].id }));
    }).catch(() => undefined).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    const res = await fetch(`/api/restaurants/${id}/products`, {
      method:  "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    });
    const data = await res.json();
    if (res.ok) {
      setSuccess(`"${data.name}" added.`);
      setForm((p) => ({ ...p, name: "", goodCode: "", adgCode: "", price: "", externalProductId: "" }));
      await load();
    } else {
      setError(data.error ?? "Failed to add product");
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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Each product requires an SRC good code and ADG code. These are used when printing fiscal receipts.
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400 mb-6">
          Loading products…
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No products yet</h3>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">Add at least one product with SRC codes to enable receipt creation.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-semibold text-gray-700">{products.length} product{products.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Good Code", "ADG Code", "Unit", "Price", "Department"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-5 py-3.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600">{p.goodCode}</code></td>
                    <td className="px-5 py-3.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600">{p.adgCode}</code></td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{p.unit}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-900">{p.isVariablePrice ? "Variable" : p.price ? `${p.price} ֏` : "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">{p.department.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add product form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Add Product</h2>
          {depts.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No departments configured.{" "}
              <Link href={`/admin/restaurants/${id}/departments`} className="underline font-semibold">Add a department first →</Link>
            </p>
          )}
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Product Name <span className="text-red-400">*</span>
                <span className="ml-1 text-gray-400 normal-case font-normal tracking-normal">— max 50 chars</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required maxLength={50} placeholder="e.g. Margherita Pizza"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Good Code (SRC) <span className="text-red-400">*</span></label>
              <input
                value={form.goodCode}
                onChange={(e) => setForm((p) => ({ ...p, goodCode: e.target.value }))}
                required placeholder="e.g. 2106-90"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">ADG Code (ԱՏԳ) <span className="text-red-400">*</span></label>
              <input
                value={form.adgCode}
                onChange={(e) => setForm((p) => ({ ...p, adgCode: e.target.value }))}
                required placeholder="e.g. 2106"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Unit</label>
              <input
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                placeholder="piece"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price (AMD) <span className="text-red-400">*</span></label>
              <input
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                required type="number" placeholder="3500"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">POS Product ID (optional)</label>
              <input
                value={form.externalProductId}
                onChange={(e) => setForm((p) => ({ ...p, externalProductId: e.target.value }))}
                placeholder="Your POS SKU"
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Department <span className="text-red-400">*</span></label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} (ID: {d.taxDepartmentId})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={saving || depts.length === 0}
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
              ) : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
