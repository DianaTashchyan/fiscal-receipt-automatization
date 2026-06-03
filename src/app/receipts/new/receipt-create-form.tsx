"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [externalOrderId, setExternalOrderId] = useState(`ORDER-${Date.now()}`);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [deliveryMethod, setDeliveryMethod] = useState("NONE");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const currentRestaurant = restaurants.find((r) => r.id === restaurantId);
  const products = currentRestaurant?.products ?? [];

  const [items, setItems] = useState<FormItem[]>([
    {
      productId: products[0]?.id ?? "",
      quantity: 1,
    },
  ]);

  function addItem() {
    setItems([
      ...items,
      {
        productId: products[0]?.id ?? "",
        quantity: 1,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof FormItem, value: string) {
    const updated = [...items];

    if (field === "quantity") {
      updated[index].quantity = Number(value);
    } else {
      updated[index].productId = value;
    }

    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const response = await fetch("/api/receipts/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId,
        externalOrderId,
        paymentMethod,
        deliveryMethod,
        customerEmail,
        customerPhone,
        items,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error ?? "Failed to create receipt");
      return;
    }

    router.push(`/receipts/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} style={form}>
      <label style={label}>
        Restaurant
        <select
          value={restaurantId}
          onChange={(e) => {
            setRestaurantId(e.target.value);
            const restaurant = restaurants.find((r) => r.id === e.target.value);
            setItems([
              {
                productId: restaurant?.products[0]?.id ?? "",
                quantity: 1,
              },
            ]);
          }}
          style={input}
        >
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </label>

      <label style={label}>
        Order ID
        <input
          value={externalOrderId}
          onChange={(e) => setExternalOrderId(e.target.value)}
          style={input}
        />
      </label>

      <label style={label}>
        Payment Method
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          style={input}
        >
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="MIXED">Mixed</option>
          <option value="ONLINE">Online</option>
        </select>
      </label>

      <label style={label}>
        Delivery Method
        <select
          value={deliveryMethod}
          onChange={(e) => setDeliveryMethod(e.target.value)}
          style={input}
        >
          <option value="NONE">None</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
        </select>
      </label>

      <label style={label}>
        Customer Email
        <input
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          style={input}
        />
      </label>

      <label style={label}>
        Customer Phone
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          style={input}
        />
      </label>

      <h2>Items</h2>

      {items.map((item, index) => (
        <div key={index} style={itemRow}>
          <select
            value={item.productId}
            onChange={(e) => updateItem(index, "productId", e.target.value)}
            style={input}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {String(product.price ?? "0")} AMD
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

      <button type="submit" style={button}>
        Create Receipt
      </button>
    </form>
  );
}

const form = {
  width: "100%",
  maxWidth: 800,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
  marginTop: 24,
};

const label = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  fontWeight: "bold",
};

const input = {
  width: "100%",
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 16,
};

const smallInput = {
  ...input,
  width: "100%",
};

const itemRow = {
  display: "grid",
  gridTemplateColumns: "1fr 100px 110px",
  gap: 12,
  alignItems: "center",
};

const button = {
  width: "100%",
  padding: "14px 18px",
  border: "none",
  borderRadius: 8,
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
  fontSize: 16,
};

const secondaryButton = {
  ...button,
  background: "#111827",
};

const dangerButton = {
  ...button,
  background: "#dc2626",
};