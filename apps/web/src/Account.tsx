import { useState } from "react";
import { CheckCircle2, LogOut, Mail, ShieldCheck } from "lucide-react";

export interface AccountSession {
  email: string;
  provider: string | null;
  signOut(): Promise<void>;
}

const providerLabel = (provider: string | null) => {
  if (!provider || provider === "email") return "Email and password";
  return `${provider[0]!.toUpperCase()}${provider.slice(1)}`;
};

export function AccountPage({ account }: { account: AccountSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <section className="panel account-panel">
      <div className="account-row">
        <span className="account-icon">
          <Mail size={19} />
        </span>
        <div>
          <span>Email</span>
          <strong>{account.email}</strong>
        </div>
      </div>
      <div className="account-row">
        <span className="account-icon">
          <ShieldCheck size={19} />
        </span>
        <div>
          <span>Sign-in method</span>
          <strong>{providerLabel(account.provider)}</strong>
        </div>
      </div>
      <div className="account-row">
        <span className="account-icon connected">
          <CheckCircle2 size={19} />
        </span>
        <div>
          <span>Session</span>
          <strong>Connected to shared tracker</strong>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="account-actions">
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void account.signOut().catch((cause: unknown) => {
              setBusy(false);
              setError(
                cause instanceof Error ? cause.message : "Could not sign out.",
              );
            });
          }}
        >
          <LogOut size={17} />
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}
