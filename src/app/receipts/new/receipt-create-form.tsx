"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function makeOrderId() {
  return `ORDER-${Date.now()}`;
}

type Product = {
  id: string;
  externalProductId: string | null;
  name: string;
  price: unknown;
};

type Restaurant = {
  id: string;
  name: string;
  products: Product[];
};

type Props = {
  restaurants: Restaurant[];
};

type FormItem = {
  productId: string;
  quantity: number;
};

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
  const products          = currentRestaurant?.products ?? [];
  const hasProducts       = products.length > 0;

  const [items, setItems] = useState<FormItem[]>([
    { productId: products[0]?.id ?? "", quantity: 1 },
  ]);

  function onRestaurantChange(id: string) {
    setRestaurantId(id);
    const r = restaurants.find((rest) => rest.id === id);
    setItems([{ productId: r?.products[0]?.id ?? "", quantity: 1 }]);
    setSubmitError("");
  }

  function addItem() {
    setItems([...items, { productId: products[0]?.id ?? "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    const updated = [...items];
    if (field === "quantity") updated[index].quantity = Number(value);
    else updated[index].productId = value;
    setItems(updated);
  }

  const validItems = items.filter((it) => it.productId && it.quantity > 0);
  const canSubmit  = hasProducts && validItems.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true); setSubmitError("");

    const token = localStorage.getItem("admin_token") ?? "";
    const res = await fetch("/api/receipts/manual", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ restaurantId, externalOrderId, paymentMethod, deliveryMethod, customerEmail, customerPhone, items: validItems }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) { setSubmitError(data.error ?? "Failed to create receipt"); return; }
    router.push(`/receipts/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Restaurant + Order ID */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Order Details</h2>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Restaurant</label>
            <select
              value={restaurantId}
              onChange={(e) => onRestaurantChange(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Order ID</label>
            <input
              value={externalOrderId}
              onChange={(e) => setExternalOrderId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="MIXED">Mixed</option>
              <option value="ONLINE">Online</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery Method</label>
            <select
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="NONE">None</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Customer Email</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Customer Phone</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+374 XX XXX XXX"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Items</h2>
          {hasProducts && (
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
          )}
        </div>

        <div className="p-6">
          {!hasProducts && restaurantId && (
            <div className="flex items-start gap-3 px-4 py-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-4">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <strong>No products configured.</strong> A receipt requires at least one product.{" "}
                <Link href={`/admin/restaurants/${restaurantId}/products`} className="underline font-semibold">Add products →</Link>
                {" or "}
                <Link href={`/admin/restaurants/${restaurantId}/onboarding`} className="underline font-semibold">Continue onboarding</Link>
              </div>
            </div>
          )}

          {hasProducts ? (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-3 items-center">
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(index, "productId", e.target.value)}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {String(p.price ?? "0")} ֏
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-center bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="w-10 h-10 flex items-center justify-center border border-red-200 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Add products to this restaurant to create receipts.</p>
          )}
        </div>
      </div>

      {/* Errors + Submit */}
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
        title={!hasProducts ? "Add products to this restaurant first" : validItems.length === 0 ? "Select at least one product" : undefined}
        className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {submitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating receipt…
          </span>
        ) : !hasProducts ? "No products — cannot create receipt" : "Create Receipt"}
      </button>
    </form>
  );
}
