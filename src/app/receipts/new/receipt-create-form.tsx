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

  const [restaurantId, setRestaurantId] = useState(restaurants[0]?.id ?? "");
  const [externalOrderId, setExternalOrderId] = useState(makeOrderId);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [deliveryMethod, setDeliveryMethod] = useState("NONE");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const currentRestaurant = restaurants.find((r) => r.id === restaurantId);
  const products = currentRestaurant?.products ?? [];
  const hasProducts = products.length > 0;

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

  // Submission is only valid when there is at least one item with a real product selected
  const validItems = items.filter((it) => it.productId && it.quantity > 0);
  const canSubmit = hasProducts && validItems.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");

    const res = await fetch("/api/receipts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        externalOrderId,
        paymentMethod,
        deliveryMethod,
        customerEmail,
        customerPhone,
        items: validItems,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(data.error ?? "Failed to create receipt");
      return;
    }

    router.push(`/receipts/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} style={form}>
      {/* Restaurant selector */}
      <label style={label}>
        Restaurant
        <select
          value={restaurantId}
          onChange={(e) => onRestaurantChange(e.target.value)}
          style={input}
        >
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>

      {/* No-products warning */}
      {!hasProducts && restaurantId && (
        <div style={warningBox}>
          <strong>No products configured for this restaurant.</strong>
          <br />
          A receipt requires at least one product. Go to the restaurant management page to add products first.
          <br />
          <Link href={`/admin/restaurants/${restaurantId}/products`} style={linkStyle}>
            Add products →
          </Link>
          {" or "}
          <Link href={`/admin/restaurants/${restaurantId}/onboarding`} style={linkStyle}>
            Continue onboarding
          </Link>
        </div>
      )}

      <label style={label}>
        Order ID
        <input value={externalOrderId} onChange={(e) => setExternalOrderId(e.target.value)} style={input} />
      </label>

      <label style={label}>
        Payment Method
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={input}>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="MIXED">Mixed</option>
          <option value="ONLINE">Online</option>
        </select>
      </label>

      <label style={label}>
        Delivery Method
        <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} style={input}>
          <option value="NONE">None</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
        </select>
      </label>

      <label style={label}>
        Customer Email
        <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={input} />
      </label>

      <label style={label}>
        Customer Phone
        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={input} />
      </label>

      <h2>Items</h2>

      {hasProducts ? (
        <>
          {items.map((item, index) => (
            <div key={index} style={itemRow}>
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, "productId", e.target.value)}
                style={input}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {String(p.price ?? "0")} AMD
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(index, "quantity", e.target.value)}
                style={smallInput}
              />
              <button type="button" onClick={() => removeItem(index)} style={dangerButton}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addItem} style={secondaryButton}>
            + Add Item
          </button>
        </>
      ) : (
        <p style={{ color: "#9ca3af", fontSize: 14 }}>
          Add products to this restaurant to create receipts.
        </p>
      )}

      {submitError && (
        <div style={errorBox}>{submitError}</div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        title={!hasProducts ? "Add products to this restaurant first" : validItems.length === 0 ? "Select at least one product" : undefined}
        style={{ ...button, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}
      >
        {submitting ? "Creating…" : !hasProducts ? "No products — cannot create receipt" : "Create Receipt"}
      </button>
    </form>
  );
}

// ---- Styles ----

const form: React.CSSProperties = {
  width: "100%",
  maxWidth: 800,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  marginTop: 24,
};

const label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontWeight: "bold",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 16,
};

const smallInput: React.CSSProperties = { ...input, width: "100%" };

const itemRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 100px 110px",
  gap: 12,
  alignItems: "center",
};

const button: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  border: "none",
  borderRadius: 8,
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  fontSize: 16,
};

const secondaryButton: React.CSSProperties = { ...button, background: "#111827" };
const dangerButton: React.CSSProperties = { ...button, background: "#dc2626" };

const warningBox: React.CSSProperties = {
  padding: "12px 16px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: 8,
  color: "#9a3412",
  fontSize: 14,
  lineHeight: 1.6,
};

const errorBox: React.CSSProperties = {
  padding: "12px 16px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  color: "#991b1b",
  fontSize: 14,
};

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "underline",
  fontWeight: 600,
};
