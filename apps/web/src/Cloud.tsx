import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import { App } from "./App";
import { stateSchema } from "../../../packages/tracker/model";
import type { TrackerState } from "../../../packages/tracker/model";
import { loadState } from "../../../packages/tracker/storage";
import { initialState } from "../../../packages/tracker/seed";

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
  if (config === null) return <App />;
  return <Connected config={config} />;
}
function Connected({ config }: { config: Config }) {
  const [client] = useState(() =>
    createClient(config.supabaseUrl, config.publishableKey),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [local, setLocal] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
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
  useEffect(() => {
    let cancelled = false;
    setActive("");
    setIds([]);
    setInvite("");
    if (userId)
      void api("/workspaces")
        .then((value) => {
          if (!cancelled) {
            const list = z.array(z.string().uuid()).parse(value);
            setIds(list);
            setActive(list[0] ?? "");
          }
        })
        .catch((e) => {
          if (!cancelled) setError(String(e.message));
        });
    return () => {
      cancelled = true;
    };
    // Reload membership only when the signed-in user changes, not token refreshes.
  }, [userId]);
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
    id: `${userId}:${active}`,
    load: async () => stateSchema.parse(await api(`/workspaces/${active}`)),
    save: async (state) =>
      stateSchema.parse(await api(`/workspaces/${active}`, "PUT", state)),
  };
  return (
    <>
      <section className="cloud-bar panel">
        <strong>{local ? "Personal browser tracker" : "Shared tracker"}</strong>
        {session && (
          <>
            <span>{session.user.email}</span>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { error } = await client.auth.signOut();
                  if (error) throw error;
                  setActive("");
                })
              }
            >
              Sign out
            </button>
          </>
        )}
        <button
          onClick={() => {
            setLocal(!local);
            setError("");
          }}
        >
          Open {local ? "shared" : "personal browser"} tracker
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
      {local ? (
        <App key="personal" />
      ) : !session ? (
        <main className="recovery panel">
          <h1>Push together, from any device</h1>
          <p>
            Sign in with your own email. Join the same tracker to share matches
            and account stars.
          </p>
          {!config.emailAuthEnabled && (
            <p>
              Use the account created by your tracker owner. Public sign-up and
              email recovery are not enabled yet.
            </p>
          )}
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
                    const form = event.currentTarget.form!;
                    if (!form.reportValidity()) return;
                    const data = new FormData(form);
                    void run(async () => {
                      const { error } = await client.auth.signUp({
                        email: String(data.get("email")),
                        password: String(data.get("password")),
                        options: { emailRedirectTo: window.location.origin },
                      });
                      if (error) throw error;
                      setError(
                        "Check your email to confirm your account, then sign in.",
                      );
                    });
                  }}
                >
                  Create account
                </button>
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
        <>
          <section className="cloud-bar panel">
            {ids.length > 0 && (
              <label>
                Your trackers
                <select
                  value={active}
                  onChange={(e) => {
                    setActive(e.target.value);
                    setInvite("");
                  }}
                >
                  {ids.map((id, i) => (
                    <option key={id} value={id}>
                      Tracker {i + 1} · {id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const state = loadState(localStorage, "real");
                  if (
                    !window.confirm(
                      `Create a shared tracker from this browser's ${state.matches.length} real matches? Your local copy stays available.`,
                    )
                  )
                    return;
                  const { id } = z
                    .object({ id: z.string().uuid() })
                    .parse(await api("/workspaces", "POST", state));
                  setIds([...ids, id]);
                  setActive(id);
                })
              }
            >
              Create shared tracker from local matches
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (
                    !window.confirm(
                      "Start a separate empty season? Your previous trackers and matches will remain available.",
                    )
                  )
                    return;
                  const empty = initialState("real");
                  const { id } = z.object({ id: z.string().uuid() }).parse(
                    await api("/workspaces", "POST", {
                      ...empty,
                      matches: [],
                      audit: [],
                      push: {
                        ...empty.push,
                        name: "New season",
                        startingStars: 0,
                      },
                    }),
                  );
                  setIds([...ids, id]);
                  setActive(id);
                })
              }
            >
              Start a new shared season
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run(async () => {
                  const { id } = z.object({ id: z.string().uuid() }).parse(
                    await api("/join", "POST", {
                      code: String(data.get("code")).trim(),
                    }),
                  );
                  setIds([...new Set([...ids, id])]);
                  setActive(id);
                });
              }}
            >
              <input
                aria-label="Invitation code"
                name="code"
                placeholder="Paste invitation code"
                required
                pattern="[a-f0-9]{64}"
              />
              <button disabled={busy}>Join tracker</button>
            </form>
            {active && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = z
                      .object({ code: z.string() })
                      .parse(
                        await api(`/workspaces/${active}/invite`, "POST", {}),
                      );
                    setInvite(value.code);
                  })
                }
              >
                Create invitation
              </button>
            )}
            {invite && (
              <label>
                Share this single-use code privately with your teammate. Expires
                in 24 hours.
                <input
                  readOnly
                  value={invite}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
            )}
          </section>
          {active ? (
            <App key={remote.id} remote={remote} />
          ) : (
            <main className="recovery panel">
              <h1>Choose your shared tracker</h1>
              <p>
                Create it once, then give Gaurav an invitation code. Each person
                signs in with their own account.
              </p>
            </main>
          )}
        </>
      )}
    </>
  );
}
