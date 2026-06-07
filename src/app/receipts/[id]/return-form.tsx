"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type SrcReturnItem = {
  receiptProductId: number;
  quantity: number;
  goodName: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  price: number;
  dep: number;
  taxRegime: number;
  discount?: number;
};

type OriginalPayment = {
  paymentMethod: string;
  paidCashAmount: number;
  paidCardAmount: number;
  billAmount: number;
  fiscalNumber: string | null;
  receiptNumber: string | null;
};

type ReturnInfoResult = {
  items: SrcReturnItem[];
};

type Props = {
  receiptId: string;
  receiptFiscalNumber: string | null;
  receiptDate: string;
  receiptTotal: number;
};

const FIELD = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors";

export default function ReturnReceiptForm({ receiptId, receiptFiscalNumber, receiptDate, receiptTotal }: Props) {
  const router = useRouter();

  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [srcItems, setSrcItems]           = useState<SrcReturnItem[]>([]);
  const [originalPayment, setOriginalPayment] = useState<OriginalPayment | null>(null);
  const [quantities, setQuantities]       = useState<Record<number, string>>({});
  const [cashRefund, setCashRefund]       = useState("0");
  const [cardRefund, setCardRefund]       = useState("0");

  useEffect(() => {
    const token = localStorage.getItem("admin_token") ?? "";
    fetch(`/api/receipts/${receiptId}/return-info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setLoadError(data.error ?? "Failed to load return info");
          return;
        }
        const info: ReturnInfoResult = data.result;
        const payment: OriginalPayment = data.originalPayment;
        setSrcItems(info.items);
        setOriginalPayment(payment);

        // Pre-fill quantities as 0 for all items
        const initQty: Record<number, string> = {};
        for (const item of info.items) {
          initQty[item.receiptProductId] = "0";
        }
        setQuantities(initQty);

        // Pre-fill refund amounts matching original payment split
        setCashRefund(String(payment.paidCashAmount));
        setCardRefund(String(payment.paidCardAmount));
      })
      .catch((err) => setLoadError(err.message ?? "Network error"))
      .finally(() => setLoading(false));
  }, [receiptId]);

  // Compute total return amount from selected items
  const selectedItems = srcItems.filter((item) => {
    const qty = parseFloat(quantities[item.receiptProductId] ?? "0");
    return qty > 0;
  });

  const computedTotal = selectedItems.reduce((sum, item) => {
    const qty = parseFloat(quantities[item.receiptProductId] ?? "0");
    const disc = item.discount ?? 0;
    return sum + (item.price * qty - disc);
  }, 0);

  function setQuantity(receiptProductId: number, value: string, max: number) {
    const num = parseFloat(value);
    if (value !== "" && (isNaN(num) || num < 0)) return;
    if (!isNaN(num) && num > max) return;
    setQuantities((prev) => ({ ...prev, [receiptProductId]: value }));
  }

  function setAllQuantities(full: boolean) {
    const next: Record<number, string> = {};
    for (const item of srcItems) {
      next[item.receiptProductId] = full ? String(item.quantity) : "0";
    }
    setQuantities(next);

    if (full && originalPayment) {
      setCashRefund(String(originalPayment.paidCashAmount));
      setCardRefund(String(originalPayment.paidCardAmount));
    } else {
      setCashRefund("0");
      setCardRefund("0");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (selectedItems.length === 0) {
      setSubmitError("Select at least one item to return");
      return;
    }

    const cashAmt = parseFloat(cashRefund) || 0;
    const cardAmt = parseFloat(cardRefund) || 0;
    if (cashAmt + cardAmt <= 0) {
      setSubmitError("Total refund amount must be greater than 0");
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem("admin_token") ?? "";

    const payload = {
      items: selectedItems.map((item) => ({
        receiptProductId: item.receiptProductId,
        quantity: parseFloat(quantities[item.receiptProductId] ?? "0"),
        name: item.goodName,
        goodCode: item.goodCode,
        adgCode: item.adgCode,
        unit: item.unit,
        price: item.price,
        dep: item.dep,
        taxRegime: item.taxRegime,
      })),
      cashAmountForReturn: cashAmt,
      cardAmountForReturn: cardAmt,
    };

    try {
      const res = await fetch(`/api/receipts/${receiptId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSubmitting(false);

      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create return receipt");
        return;
      }

      router.push(`/receipts/${data.id}`);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "Network error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading receipt items from SRC…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-sm font-semibold text-red-700 mb-2">Failed to load return info</p>
        <p className="text-sm text-red-500 mb-4">{loadError}</p>
        <Link href={`/receipts/${receiptId}`} className="text-sm font-semibold text-red-600 hover:underline">
          Back to receipt
        </Link>
      </div>
    );
  }

  const totalRefund = (parseFloat(cashRefund) || 0) + (parseFloat(cardRefund) || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Original receipt summary */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-bold text-gray-900">Original Receipt</h2>
        </div>
        <dl className="divide-y divide-gray-50">
          {[
            { label: "Fiscal Number", value: receiptFiscalNumber ?? "—", mono: true },
            { label: "Date",          value: receiptDate },
            { label: "Total",         value: `${receiptTotal.toLocaleString()} ֏` },
            originalPayment && { label: "Payment", value: originalPayment.paymentMethod },
          ].filter(Boolean).map((row) => {
            const r = row as { label: string; value: string; mono?: boolean };
            return (
              <div key={r.label} className="flex items-center justify-between px-6 py-3">
                <dt className="text-xs text-gray-500 font-medium">{r.label}</dt>
                <dd className={`text-sm font-semibold text-gray-900 ${r.mono ? "font-mono text-xs bg-gray-100 px-2 py-0.5 rounded" : ""}`}>
                  {r.value}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Select Items to Return</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAllQuantities(true)}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Select all
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => setAllQuantities(false)}
              className="text-xs font-semibold text-gray-400 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>

        {srcItems.length === 0 ? (
          <p className="px-6 py-8 text-sm text-center text-gray-500">No items returned from SRC.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50/50">
                  {["Product", "Code", "Unit Price", "Max Qty", "Return Qty", "Return Total"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {srcItems.map((item) => {
                  const returnQty = parseFloat(quantities[item.receiptProductId] ?? "0") || 0;
                  const lineTotal = returnQty * item.price - (item.discount ?? 0) * (returnQty / item.quantity);
                  const active = returnQty > 0;
                  return (
                    <tr key={item.receiptProductId} className={active ? "bg-red-50/40" : "hover:bg-gray-50/50"}>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-900">{item.goodName}</td>
                      <td className="px-5 py-4">
                        <code className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.goodCode}</code>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{item.price.toLocaleString()} ֏</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{item.quantity}</td>
                      <td className="px-5 py-4">
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          step="any"
                          value={quantities[item.receiptProductId] ?? "0"}
                          onChange={(e) => setQuantity(item.receiptProductId, e.target.value, item.quantity)}
                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                        />
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-gray-900">
                        {active ? `${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ֏` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {selectedItems.length} of {srcItems.length} item{srcItems.length !== 1 ? "s" : ""} selected
          </span>
          <span className="text-sm font-bold text-gray-900">
            Computed: {computedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ֏
          </span>
        </div>
      </div>

      {/* Refund payment split */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-bold text-gray-900">Refund Payment Split</h2>
          <p className="text-xs text-gray-500 mt-0.5">How much to refund in cash vs card. Must be greater than 0 total.</p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Cash Refund (֏)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cashRefund}
              onChange={(e) => setCashRefund(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Card Refund (֏)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cardRefund}
              onChange={(e) => setCardRefund(e.target.value)}
              className={FIELD}
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-gray-500">Total refund</span>
          <span className="text-base font-bold text-red-700">{totalRefund.toLocaleString(undefined, { maximumFractionDigits: 2 })} ֏</span>
        </div>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
          {submitError}
        </div>
      )}

      <div className="flex items-center gap-3 justify-end">
        <Link
          href={`/receipts/${receiptId}`}
          className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting || selectedItems.length === 0}
          className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
        >
          {submitting ? "Fiscalizing return…" : "Issue Return Receipt"}
        </button>
      </div>
    </form>
  );
}
