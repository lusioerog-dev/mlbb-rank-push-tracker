import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import { App } from "./App";
import { readState } from "../../../packages/tracker/compatibility";
import type { TrackerState } from "../../../packages/tracker/model";

export interface RemoteStore {
  id: string;
  load(): Promise<TrackerState>;
  save(state: TrackerState): Promise<TrackerState>;
}
const configSchema = z.object({
  supabaseUrl: z.url(),
  publishableKey: z.string().min(1),
  apiUrl: z.url(),
  emailAuthEnabled: z.boolean().default(false),
});
type Config = z.infer<typeof configSchema>;
export function Cloud() {
  const [config, setConfig] = useState<Config | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/backend-config.json")
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Could not load the connection settings. Reload to try again.",
          );
        const value = await r.json();
        setConfig(value === null ? null : configSchema.parse(value));
      })
      .catch(() =>
        setError(
          "Could not load the connection settings. Reload to try again.",
        ),
      );
  }, []);
  if (error)
    return (
      <main className="recovery panel">
        <p role="alert">{error}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  if (config === undefined)
    return <main className="recovery">Connecting…</main>;
  if (config === null) {
    if (import.meta.env.DEV) return <App />;
    return (
      <main className="recovery" role="alert">
        The shared push is not configured.
      </main>
    );
  }
  return <Connected config={config} />;
}
function Connected({ config }: { config: Config }) {
  const [client] = useState(() =>
    createClient(config.supabaseUrl, config.publishableKey),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("Please sign in again.");
    const result = await fetch(`${config.apiUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    const value = await result.json();
    if (!result.ok)
      throw new Error(
        typeof value.error === "string" ? value.error : "Request failed.",
      );
    return value;
  }
  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const userId = session?.user.id;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <main className="recovery">Checking your sign-in…</main>;
  const remote: RemoteStore = {
    id: userId ?? "signed-out",
    load: async () => readState(await api("/v2/tracker")),
    save: async (state) => readState(await api("/v2/tracker", "PUT", state)),
  };
  return (
    <>
      <section className="cloud-bar panel">
        <strong>MLBB Pilot Push</strong>
        {session && (
          <>
            <span>{session.user.email}</span>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { error } = await client.auth.signOut();
                  if (error) throw error;
                })
              }
            >
              Sign out
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      {!session ? (
        <main className="recovery panel">
          <h1>MLBB Pilot Push</h1>
          <p>Sign in to the shared push.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(async () => {
                const { error } = await client.auth.signInWithPassword({
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                });
                if (error) throw error;
              });
            }}
          >
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
              />
            </label>
            <button disabled={busy} className="primary">
              Sign in
            </button>
            {config.emailAuthEnabled && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    const email = event.currentTarget.form!.elements.namedItem(
                      "email",
                    ) as HTMLInputElement;
                    if (!email.reportValidity()) return;
                    void run(async () => {
                      const { error } = await client.auth.signInWithOtp({
                        email: email.value,
                        options: {
                          shouldCreateUser: false,
                          emailRedirectTo: window.location.origin,
                        },
                      });
                      if (error) throw error;
                      setError(
                        "If this account exists, check your email for a sign-in link.",
                      );
                    });
                  }}
                >
                  Email me a sign-in link
                </button>
              </>
            )}
          </form>
        </main>
      ) : (
        <App key={remote.id} remote={remote} />
      )}
    </>
  );
}
