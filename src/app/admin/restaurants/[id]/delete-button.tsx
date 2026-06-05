"use client";

import { useState } from "react";

export default function DeleteRestaurantButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");

    const token = localStorage.getItem("admin_token") ?? "";

    // Missing token means the session was never established
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }

    const res = await fetch(`/api/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // 401 means the token is expired or invalid — clear it and force re-login
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("admin_token");
      window.location.href = "/admin/login";
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      setLoading(false);
      return;
    }

    // Hard navigation bypasses the Next.js router cache so the list
    // is re-fetched from the server and shows the restaurant as gone.
    window.location.href = "/admin/restaurants";
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-red-700 font-medium">
          Delete &ldquo;{name}&rdquo;? This removes all cashiers, departments, products, API keys, and receipts. This cannot be undone.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "Deleting…" : "Yes, delete permanently"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(""); }}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
    >
      Delete business
    </button>
  );
}
