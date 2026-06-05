"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function makeOrderId() {
  return `ORDER-${Date.now()}`;
}

type Department = {
  id: string;
  name: string;
  taxDepartmentId: string;
  taxRegime: string;
};

type Restaurant = {
  id: string;
  name: string;
  departments: Department[];
};

type Props = {
  restaurants: Restaurant[];
};

type FormItem = {
  name: string;
  quantity: string;
  unitPrice: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  departmentId: string;
  discountAmount: string;
};

function blankItem(deptId: string): FormItem {
  return { name: "", quantity: "1", unitPrice: "", goodCode: "", adgCode: "", unit: "Հատ", departmentId: deptId, discountAmount: "" };
}

const FIELD = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors";
const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

export default function ReceiptCreateForm({ restaurants }: Props) {
  const router = useRouter();

  const [restaurantId,    setRestaurantId]    = useState(restaurants[0]?.id ?? "");
  const [externalOrderId, setExternalOrderId] = useState(makeOrderId);
  const [paymentMethod,   setPaymentMethod]   = useState("CARD");
  const [deliveryMethod,  setDeliveryMethod]  = useState("NONE");
  const [customerEmail,   setCustomerEmail]   = useState("");
  const [customerPhone,   setCustomerPhone]   = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState("");

  const currentRestaurant = restaurants.find((r) => r.id === restaurantId);
  const departments       = currentRestaurant?.departments ?? [];
  const defaultDeptId     = departments[0]?.id ?? "";

  const [items, setItems] = useState<FormItem[]>(() => [blankItem(defaultDeptId)]);

  function onRestaurantChange(id: string) {
    setRestaurantId(id);
    const r    = restaurants.find((rest) => rest.id === id);
    const dept = r?.departments[0]?.id ?? "";
    setItems([blankItem(dept)]);
    setSubmitError("");
  }

  function addItem() {
    setItems((prev) => [...prev, blankItem(departments[0]?.id ?? "")]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function itemTotal(it: FormItem): number {
    const qty   = parseFloat(it.quantity) || 0;
    const price = parseFloat(it.unitPrice) || 0;
    const disc  = parseFloat(it.discountAmount) || 0;
    return Math.max(0, qty * price - disc);
  }

  const grandTotal = items.reduce((sum, it) => sum + itemTotal(it), 0);

  function isItemValid(it: FormItem): boolean {
    return !!(it.name.trim() && it.goodCode.trim() && it.adgCode.trim() && it.unit.trim() &&
              parseFloat(it.quantity) > 0 && parseFloat(it.unitPrice) > 0 && it.departmentId);
  }

  const allValid  = items.length > 0 && items.every(isItemValid);
  const canSubmit = allValid && !submitting && !!restaurantId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");

    const token = localStorage.getItem("admin_token") ?? "";

    const payload = {
      restaurantId,
      externalOrderId,
      paymentMethod,
      deliveryMethod,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      items: items.map((it) => {
        const dept = departments.find((d) => d.id === it.departmentId);
        return {
          name:            it.name.trim(),
          quantity:        parseFloat(it.quantity),
          unitPrice:       parseFloat(it.unitPrice),
          goodCode:        it.goodCode.trim(),
          adgCode:         it.adgCode.trim(),
          unit:            it.unit.trim(),
          departmentTaxId: dept?.taxDepartmentId ?? "",
          taxRegime:       dept?.taxRegime ?? "",
          discountAmount:  parseFloat(it.discountAmount) || 0,
        };
      }),
    };

    const res  = await fetch("/api/receipts/manual", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) { setSubmitError(data.error ?? "Failed to create receipt"); return; }
    router.push(`/receipts/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Order details */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-bold text-gray-900">Order Details</h2>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={LABEL}>Restaurant</label>
            <select value={restaurantId} onChange={(e) => onRestaurantChange(e.target.value)} className={FIELD}>
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL}>Order ID</label>
            <input value={externalOrderId} onChange={(e) => setExternalOrderId(e.target.value)} className={FIELD + " font-mono"} />
          </div>

          <div>
            <label className={LABEL}>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={FIELD}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="MIXED">Mixed</option>
              <option value="ONLINE">Online</option>
            </select>
          </div>

          <div>
            <label className={LABEL}>Delivery Method</label>
            <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} className={FIELD}>
              <option value="NONE">None</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </div>

          <div>
            <label className={LABEL}>Customer Email</label>
            <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className={FIELD} />
          </div>

          <div>
            <label className={LABEL}>Customer Phone</label>
            <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+374 XX XXX XXX" className={FIELD} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {items.map((item, index) => {
            const total = itemTotal(item);
            return (
              <div key={index} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Item {index + 1}</span>
                  <div className="flex items-center gap-3">
                    {total > 0 && (
                      <span className="text-sm font-bold text-gray-700">{total.toLocaleString("hy-AM")} ֏</span>
                    )}
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-7 h-7 flex items-center justify-center border border-red-200 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Name — full width */}
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className={LABEL}>Item Name</label>
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(index, "name", e.target.value)}
                      placeholder="e.g. Margherita Pizza"
                      maxLength={50}
                      className={FIELD}
                    />
                  </div>

                  {/* Department */}
                  <div>
                    <label className={LABEL}>Department</label>
                    <select
                      value={item.departmentId}
                      onChange={(e) => updateItem(index, "departmentId", e.target.value)}
                      className={FIELD}
                    >
                      {departments.length === 0
                        ? <option value="">No departments configured</option>
                        : departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name} (regime {d.taxRegime})</option>
                        ))
                      }
                    </select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className={LABEL}>Quantity</label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className={FIELD + " text-center"}
                    />
                  </div>

                  {/* Unit price */}
                  <div>
                    <label className={LABEL}>Unit Price (֏)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                      placeholder="0"
                      className={FIELD}
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <label className={LABEL}>Unit</label>
                    <input
                      value={item.unit}
                      onChange={(e) => updateItem(index, "unit", e.target.value)}
                      placeholder="Հատ"
                      maxLength={50}
                      className={FIELD}
                    />
                  </div>

                  {/* Good code */}
                  <div>
                    <label className={LABEL}>Good Code (HS)</label>
                    <input
                      value={item.goodCode}
                      onChange={(e) => updateItem(index, "goodCode", e.target.value)}
                      placeholder="e.g. 2106"
                      className={FIELD + " font-mono"}
                    />
                  </div>

                  {/* ADG code */}
                  <div>
                    <label className={LABEL}>ADG Code</label>
                    <input
                      value={item.adgCode}
                      onChange={(e) => updateItem(index, "adgCode", e.target.value)}
                      placeholder="e.g. 5610"
                      className={FIELD + " font-mono"}
                    />
                  </div>

                  {/* Discount */}
                  <div>
                    <label className={LABEL}>Discount (֏)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.discountAmount}
                      onChange={(e) => updateItem(index, "discountAmount", e.target.value)}
                      placeholder="0"
                      className={FIELD}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        {grandTotal > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
            <div className="text-sm">
              <span className="text-gray-500 mr-2">Total:</span>
              <span className="font-bold text-gray-900 text-base">{grandTotal.toLocaleString("hy-AM")} ֏</span>
            </div>
          </div>
        )}
      </div>

      {/* No departments warning */}
      {departments.length === 0 && restaurantId && (
        <div className="flex items-start gap-3 px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p>
            <strong>No departments configured.</strong> A tax department is required to issue receipts.{" "}
            <a href={`/admin/restaurants/${restaurantId}/departments`} className="underline font-semibold">Configure departments →</a>
          </p>
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90 shadow-sm"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating receipt…
          </span>
        ) : "Create & Fiscalize Receipt"}
      </button>
    </form>
  );
}
