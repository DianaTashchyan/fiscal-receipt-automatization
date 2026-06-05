"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRestaurantButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
    const res = await fetch(`/api/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      setLoading(false);
      // Keep confirming=true so the error stays visible
      return;
    }
    // refresh() invalidates the router cache so the list re-fetches fresh data
    router.push("/admin/restaurants");
    router.refresh();
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
      Delete restaurant
    </button>
  );
}
