"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ApiKey = { id: string; label: string | null; isActive: boolean; lastUsedAt: string | null; createdAt: string };

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function ApiKeysPage() {
  const { id } = useParams<{ id: string }>();
  const [keys, setKeys]           = useState<ApiKey[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey]       = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [label, setLabel]         = useState("");
  const [error, setError]         = useState("");

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
      body: JSON.stringify({ label: label.trim() || "POS Terminal" }),
    });
    const data = await res.json();
    if (res.ok) { setNewKey(data.key); setLabel(""); load(); }
    else setError(data.error ?? "Failed");
    setGenerating(false);
  }

  async function revoke(keyId: string) {
    await fetch(`/api/restaurants/${id}/api-keys`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ keyId }),
    });
    load();
  }

  async function copy() {
    if (newKey) { await navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  const activeKeys  = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);

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
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">API Keys</h1>
        <p className="text-sm text-gray-500 mt-1">
          POS systems authenticate with these keys via the{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-600">X-Api-Key</code> header
          when calling{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-600">POST /api/receipts</code>.
        </p>
      </div>

      {/* New key banner */}
      {newKey && (
        <div className="mb-6 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs font-semibold text-amber-400">Copy this key now — it cannot be retrieved again.</p>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <code className="text-green-400 text-xs font-mono flex-1 break-all leading-relaxed">{newKey}</code>
            <button
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white rounded-lg text-xs font-semibold hover:bg-gray-600 transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Generate form */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Generate New API Key</h2>
          <p className="text-xs text-gray-500 mt-0.5">Give each integration a descriptive label so you can identify it later.</p>
        </div>
        <div className="p-5">
          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. POS Terminal 1"
              onKeyDown={(e) => e.key === "Enter" && generate()}
              className="flex-1 border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            <button
              onClick={generate}
              disabled={generating}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : "Generate Key"}
            </button>
          </div>
        </div>
      </div>

      {/* Active keys */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          Loading keys…
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No active API keys</h3>
          <p className="text-xs text-gray-500">Generate a key above to allow POS integrations to issue receipts.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-semibold text-gray-700">{activeKeys.length} active key{activeKeys.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {activeKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">{k.label ?? "Unnamed key"}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · Never used"}
                  </p>
                </div>
                <button
                  onClick={() => revoke(k.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden opacity-60">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-semibold text-gray-500">{revokedKeys.length} revoked key{revokedKeys.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {revokedKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-500 line-through">{k.label ?? "Unnamed key"}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Revoked</span>
                  </div>
                  <p className="text-xs text-gray-400">Created {new Date(k.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
