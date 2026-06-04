"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ApiKey = { id: string; label: string | null; isActive: boolean; lastUsedAt: string | null; createdAt: string };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function ApiKeysPage() {
  const { id } = useParams<{ id: string }>();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/restaurants/${id}/api-keys`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ApiKey[]) => setKeys(data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setGenerating(true); setError(""); setNewKey(null);
    const res = await fetch(`/api/restaurants/${id}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ label: label || "POS Terminal" }),
    });
    const data = await res.json();
    if (res.ok) { setNewKey(data.key); setLabel(""); await load(); }
    else setError(data.error ?? "Failed");
    setGenerating(false);
  }

  async function revoke(keyId: string) {
    await fetch(`/api/restaurants/${id}/api-keys`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ keyId }),
    });
    await load();
  }

  async function copy() {
    if (newKey) { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/restaurants/${id}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">← Restaurant</Link>
      <h1 className="text-xl font-bold text-gray-900 mb-2">API Keys</h1>
      <p className="text-sm text-gray-500 mb-6">POS systems use these keys in the <code className="bg-gray-100 px-1 rounded">X-Api-Key</code> header when calling <code className="bg-gray-100 px-1 rounded">POST /api/receipts</code>.</p>

      {newKey && (
        <div className="mb-4 bg-gray-900 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-2">⚠ Copy this key now — it cannot be retrieved again.</p>
          <div className="flex items-center gap-2">
            <code className="text-green-400 text-xs font-mono flex-1 break-all">{newKey}</code>
            <button onClick={copy} className="shrink-0 px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
        <div className="flex flex-col gap-2 mb-6">
          {keys.length === 0 && <p className="text-gray-400 text-sm">No API keys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className={`bg-white border rounded-xl px-4 py-3 flex justify-between items-center ${k.isActive ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
              <div>
                <span className="font-medium text-gray-900 text-sm">{k.label ?? "Unnamed key"}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${k.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {k.isActive ? "Active" : "Revoked"}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}{k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              {k.isActive && (
                <button onClick={() => revoke(k.id)} className="text-xs text-red-500 hover:text-red-700 ml-4">Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Generate new API key</h2>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. POS Terminal 1"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={generate} disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
