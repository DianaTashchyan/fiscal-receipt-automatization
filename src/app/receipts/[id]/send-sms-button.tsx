"use client";

import { useState } from "react";

export default function SendSmsButton({
  receiptId,
  defaultPhone,
}: {
  receiptId: string;
  defaultPhone?: string | null;
}) {
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [loading, setLoading] = useState(false);

  async function sendSms() {
    if (!phone) {
      alert("Please enter customer phone");
      return;
    }

    setLoading(true);

    const response = await fetch(`/api/receipts/${receiptId}/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      alert(data.error ?? "Failed to send SMS");
      return;
    }

    alert("SMS link sent");
    window.location.reload();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Customer phone"
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginRight: 12,
          minWidth: 280,
        }}
      />

      <button
        type="button"
        onClick={sendSms}
        disabled={loading}
        style={{
          padding: "12px 18px",
          background: "#16a34a",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {loading ? "Sending..." : "Send SMS Link"}
      </button>
    </div>
  );
}