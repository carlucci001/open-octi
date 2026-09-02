"use client";
import { useState } from "react";
import PaymentForm from "./PaymentForm";

const ACTIONS = [
  { id: "payment", icon: "💳", label: "Take Payment" },
  { id: "crm", icon: "🎯", label: "Open CRM" },
  { id: "email", icon: "✉", label: "Compose Email" },
];

export default function QuickActions({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const handleAction = (id) => {
    setOpen(false);
    switch (id) {
      case "payment": setShowPayment(true); break;
      case "crm": onNavigate("crm"); break;
      case "email": onNavigate("comms"); break;
    }
  };

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-40">
        {open && (
          <div className="absolute bottom-14 right-0 rounded-xl p-2 w-52 animate-fade-in shadow-2xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            {ACTIONS.map(a => (
              <button key={a.id} onClick={() => handleAction(a.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={{ color: "var(--text)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setOpen(o => !o)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-all hover:scale-110"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}>
          {open ? "✕" : "+"}
        </button>
      </div>

      {/* Payment modal */}
      {showPayment && (
        <PaymentForm
          onClose={() => setShowPayment(false)}
          onSuccess={() => setShowPayment(false)}
        />
      )}
    </>
  );
}
