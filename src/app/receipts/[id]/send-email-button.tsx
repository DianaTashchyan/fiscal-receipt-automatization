"use client";

import { useState } from "react";

export default function SendEmailButton({
  receiptId,
  defaultEmail,
}: {
  receiptId: string;
  defaultEmail?: string | null;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [loading, setLoading] = useState(false);

  async function sendEmail() {
    if (!email) {
      alert("Please enter customer email");
      return;
    }

    setLoading(true);

    const response = await fetch(`/api/receipts/${receiptId}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      alert(data.error ?? "Failed to send email");
      return;
    }

    alert("Receipt sent by email");
    window.location.reload();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Customer email"
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
        onClick={sendEmail}
        disabled={loading}
        style={{
          padding: "12px 18px",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {loading ? "Sending..." : "Send PDF by Email"}
      </button>
    </div>
  );
}