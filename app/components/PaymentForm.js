"use client";
import ThemedSelect from './ThemedSelect'
import { useState, useEffect, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

function api(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
}
const fmt = n => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "14px",
      color: "#1a1c2e",
      fontFamily: "system-ui, -apple-system, sans-serif",
      "::placeholder": { color: "#9ca3af" },
    },
    invalid: { color: "#ef4444" },
  },
  hidePostalCode: false,
}

const CARD_ELEMENT_OPTIONS_DARK = {
  ...CARD_ELEMENT_OPTIONS,
  style: {
    base: { ...CARD_ELEMENT_OPTIONS.style.base, color: "#cdd6f4", "::placeholder": { color: "#7f849c" } },
    invalid: CARD_ELEMENT_OPTIONS.style.invalid,
  },
}

function InnerForm({ prefillClient, onSuccess, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [clients, setClients] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState({ msg: "", kind: "info" });
  const [form, setForm] = useState({
    clientId: prefillClient?.id || "",
    clientName: prefillClient?.name || "",
    description: "",
    amount: "",
    email: prefillClient?.email || "",
    type: "one-time",
    invoiceId: "",
  });
  const [cardReady, setCardReady] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(d => setClients(d.clients || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.clientId) { setUnpaidInvoices([]); return }
    fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_unpaid_for_client", clientId: form.clientId }) })
      .then(r => r.json())
      .then(d => setUnpaidInvoices(d.invoices || []))
      .catch(() => {});
  }, [form.clientId]);

  const pickInvoice = (id) => {
    setForm(f => ({ ...f, invoiceId: id }));
    if (!id) return;
    const inv = unpaidInvoices.find(i => i.id === id);
    if (inv) setForm(f => ({ ...f, invoiceId: id, amount: String(inv.amount || ""), description: `Invoice ${inv.number}${inv.project ? ' — ' + inv.project : ''}` }));
  };

  const flash = (m, kind = "info") => {
    setToast({ msg: m, kind });
    if (kind !== "error") setTimeout(() => setToast({ msg: "", kind: "info" }), 3000);
  };
  const clearToast = () => setToast({ msg: "", kind: "info" });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectClient = (id) => {
    const c = clients.find(cl => cl.id === id);
    if (c) setForm(f => ({ ...f, clientId: id, clientName: c.name, email: c.email || f.email }));
    else setForm(f => ({ ...f, clientId: "", clientName: "" }));
  };

  const processPayment = async () => {
    if (!form.clientName || !form.amount) { flash("Need client name and amount", "error"); return; }
    if (!stripe || !elements) { flash("Stripe not loaded yet. Try again in a second.", "error"); return; }
    if (!cardReady) { flash("Fill in the card details first", "error"); return; }

    setProcessing(true);
    try {
      // 1. Create PaymentIntent on server
      const intentRes = await api("/api/payments", {
        action: "create_intent",
        clientName: form.clientName, clientId: form.clientId, description: form.description,
        amount: form.amount, email: form.email,
      });
      if (intentRes.error) { console.error("[payment] create_intent failed:", intentRes); flash("Intent failed: " + intentRes.error, "error"); setProcessing(false); return; }

      // 2. Confirm with Stripe client-side (card stays in iframe, never touches our server)
      const cardElement = elements.getElement(CardElement);
      const result = await stripe.confirmCardPayment(intentRes.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: form.clientName, email: form.email || undefined },
        },
      });
      if (result.error) { console.error("[payment] confirmCardPayment:", result.error); flash("Charge failed: " + result.error.message, "error"); setProcessing(false); return; }
      if (result.paymentIntent?.status !== "succeeded") { flash("Status: " + result.paymentIntent?.status, "error"); setProcessing(false); return; }

      // 3. Tell server to record the successful payment
      const recordRes = await api("/api/payments", {
        action: "record_from_intent",
        intentId: result.paymentIntent.id,
        email: form.email, type: form.type,
        invoiceId: form.invoiceId || undefined,
      });
      if (recordRes.error) { console.error("[payment] record_from_intent:", recordRes); flash("Recorded on Stripe but not saved locally: " + recordRes.error, "error"); setProcessing(false); return; }

      // 4. If linked to an invoice, mark it paid
      if (form.invoiceId) {
        await api("/api/invoices", {
          action: "mark_paid_manual",
          id: form.invoiceId,
          amount: parseFloat(form.amount),
          paymentId: result.paymentIntent.id,
          method: "card",
        });
      }

      flash(`Payment successful — ${fmt(parseFloat(form.amount))}${form.invoiceId ? " (invoice marked paid)" : ""}`, "success");
      setTimeout(() => onSuccess?.(), 800);
    } catch (e) {
      console.error("[payment] exception:", e);
      flash(e.message, "error");
    }
    setProcessing(false);
  };

  const recordManual = async () => {
    if (!form.clientName || !form.amount) { flash("Need client name and amount", "error"); return; }
    const recordRes = await api("/api/payments", { action: "record", ...form, amount: form.amount, invoiceId: form.invoiceId || undefined });
    if (recordRes.error) { flash(recordRes.error, "error"); return; }
    if (form.invoiceId) {
      const invoiceRes = await api("/api/invoices", { action: "mark_paid_manual", id: form.invoiceId, amount: parseFloat(form.amount), method: "manual" });
      if (invoiceRes.error) { flash(invoiceRes.error, "error"); return; }
    }
    flash("Payment recorded" + (form.invoiceId ? " (invoice marked paid)" : ""), "success");
    window.dispatchEvent(new CustomEvent("fcc:payments-changed"));
    setTimeout(() => onSuccess?.(), 800);
  };

  const is = { background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", padding: "8px 12px", borderRadius: 8, fontSize: 13, outline: "none", width: "100%" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6 animate-fade-in max-h-[90vh] overflow-auto" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
        {toast.msg && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2" style={{
            background: toast.kind === "error" ? "var(--red-soft)" : toast.kind === "success" ? "var(--green-soft)" : "var(--surface2)",
            color: toast.kind === "error" ? "var(--red)" : toast.kind === "success" ? "var(--green)" : "var(--accent)",
            border: toast.kind === "error" ? "1px solid var(--red)" : "none",
          }}>
            <span className="flex-1">{toast.kind === "error" ? "⚠ " : toast.kind === "success" ? "✓ " : ""}{toast.msg}</span>
            {toast.kind === "error" && <button onClick={clearToast} className="opacity-70 hover:opacity-100">×</button>}
          </div>
        )}

        <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text)" }}>💳 Process Payment</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Farrington Development — Secure via Stripe Elements</p>

        {!prefillClient && clients.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Select Client</label>
            <ThemedSelect style={is} value={form.clientId} onChange={e => selectClient(e.target.value)}>
              <option value="">— Type name or select —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </ThemedSelect>
          </div>
        )}

        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Client Name *</label>
          <input style={is} placeholder="John Smith" value={form.clientName} onChange={e => u("clientName", e.target.value)} /></div>

        {unpaidInvoices.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Apply to Invoice (optional)</label>
            <ThemedSelect style={is} value={form.invoiceId} onChange={e => pickInvoice(e.target.value)}>
              <option value="">— None (one-time payment) —</option>
              {unpaidInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.number} · {fmt(Number(inv.amount) || 0)}{inv.project ? ' · ' + inv.project : ''}</option>)}
            </ThemedSelect>
            {form.invoiceId && <p className="text-[11px] mt-1" style={{ color: "var(--green)" }}>✓ This invoice will be marked paid on success</p>}
          </div>
        )}

        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>{form.invoiceId ? "Description" : "Invoice / Project"}</label>
          <input style={is} placeholder="Website redesign — Phase 1" value={form.description} onChange={e => u("description", e.target.value)} /></div>
        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Amount (USD) *</label>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: "var(--green)" }}>$</span>
          <input style={{ ...is, paddingLeft: 24 }} type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => u("amount", e.target.value)} /></div></div>
        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Email for Receipt</label>
          <input style={is} type="email" placeholder="redacted@example.invalid" value={form.email} onChange={e => u("email", e.target.value)} /></div>
        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-muted)" }}>Payment Type</label>
          <ThemedSelect style={is} value={form.type} onChange={e => u("type", e.target.value)}><option value="one-time">One-time</option><option value="recurring">Recurring</option></ThemedSelect></div>

        <div className="rounded-lg p-4 mb-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium mb-3" style={{ color: "var(--text-muted)" }}>💳 Card Details (secured by Stripe)</div>
          <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <CardElement
              options={typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? CARD_ELEMENT_OPTIONS_DARK : CARD_ELEMENT_OPTIONS}
              onChange={(e) => setCardReady(e.complete)}
            />
          </div>
          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
            Card details never touch your server — encrypted directly to Stripe.
          </p>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "var(--green)", color: "var(--accent-text)" }} onClick={processPayment} disabled={processing || !stripe}>{processing ? "Processing..." : `Charge ${form.amount ? fmt(parseFloat(form.amount) || 0) : "$0.00"}`}</button>
          <button className="px-3 py-2.5 rounded-lg text-xs font-medium" style={{ background: "var(--surface2)", color: "var(--peach)", border: "1px solid var(--border)" }} onClick={recordManual}>Record Only</button>
          <button className="px-3 py-2.5 rounded-lg text-sm" style={{ background: "var(--surface2)", color: "var(--text-muted)" }} onClick={onClose}>Cancel</button>
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>"Record Only" saves to history without charging</p>
      </div>
    </div>
  );
}

export default function PaymentForm(props) {
  // Load Stripe.js once. Re-memoize only if PK changes (it won't at runtime).
  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PK;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  if (!stripePromise) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={props.onClose}>
        <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text)" }}>Stripe not configured</h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Add <code>NEXT_PUBLIC_STRIPE_PK</code> to <code>.env.local</code> and restart the dev server.</p>
          <button onClick={props.onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: "var(--surface2)", color: "var(--text)" }}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <InnerForm {...props} />
    </Elements>
  );
}
