import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { handle } from "./index";
import { initialState } from "../../packages/tracker/seed";
import { readState } from "../../packages/tracker/compatibility";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
  ALLOWED_ORIGIN: "https://tracker.example",
  SHARED_WORKSPACE_ID: other,
};
const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`https://api.example${path}`, {
    method,
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
test("API rejects unauthenticated and foreign-origin requests before accessing data", async () => {
  const fetcher: typeof fetch = async () => {
    throw new Error("Must not fetch");
  };
  assert.equal(
    (await handle(new Request("https://api.example/workspaces"), env, fetcher))
      .status,
    401,
  );
  assert.equal(
    (
      await handle(
        new Request("https://api.example/workspaces", {
          headers: { Origin: "https://evil.example" },
        }),
        env,
        fetcher,
      )
    ).status,
    403,
  );
});
test("API verifies identity and refuses nonmembers and obsolete creation requests", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: owner,
        email_confirmed_at: "2026-09-13T00:00:00Z",
      });
    if (url.includes("tracker_members?")) return Response.json([]);
    throw new Error("Unexpected database write");
  };
  assert.equal(
    (await handle(req(`/workspaces/${other}`), env, fetcher)).status,
    403,
  );
  assert.equal(
    (
      await handle(
        req("/workspaces", "POST", {
          ...initialState(),
          version: 1,
          dataset: "demo",
        }),
        env,
        fetcher,
      )
    ).status,
    405,
  );
  assert.equal(
    (await handle(req("/workspaces", "POST", {}), env, fetcher)).status,
    405,
  );
});
test("private endpoint rejects retired routes, foreign workspaces and missing configuration", async () => {
  let databaseCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user"))
      return Response.json({
        id: owner,
        email_confirmed_at: "2026-09-13T00:00:00Z",
      });
    databaseCalls++;
    throw new Error("Unexpected database call");
  };
  for (const [path, method, status] of [
    ["/join", "POST", 404],
    [`/workspaces/${other}/invite`, "POST", 404],
    ["/workspaces", "POST", 405],
    [`/workspaces/${owner}`, "GET", 404],
    ["/tracker", "POST", 405],
  ] as const) {
    assert.equal(
      (await handle(req(path!, method!), env, fetcher)).status,
      status,
    );
  }
  assert.equal(
    (
      await handle(
        req("/tracker"),
        { ...env, SHARED_WORKSPACE_ID: "" },
        fetcher,
      )
    ).status,
    503,
  );
  assert.equal(databaseCalls, 0);
});

test("both existing members can read the same pinned push and unconfirmed users cannot", async () => {
  for (const actor of [owner, other]) {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user"))
        return Response.json({
          id: actor,
          email_confirmed_at: "2026-09-13T00:00:00Z",
        });
      if (url.includes("tracker_members?")) {
        assert.ok(url.includes(`workspace_id=eq.${other}&user_id=eq.${actor}`));
        return Response.json([{ user_id: actor }]);
      }
      assert.ok(url.includes(`tracker_workspaces?id=eq.${other}&select=state`));
      return Response.json([
        { state: { ...initialState(), version: 1, dataset: "real" } },
      ]);
    };
    const result = await handle(req("/tracker"), env, fetcher);
    assert.equal(result.status, 200);
    assert.deepEqual(readState(await result.json()), initialState());
    const legacy = await handle(req("/workspaces"), env, fetcher);
    assert.deepEqual(await legacy.json(), [other]);
  }
  const unconfirmed: typeof fetch = async () =>
    Response.json({ id: owner, email_confirmed_at: null });
  assert.equal((await handle(req("/tracker"), env, unconfirmed)).status, 403);
});
test("versioned API reads and saves canonical state through the v2 functions", async () => {
  let loadCalls = 0;
  const canonical = initialState();
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: owner,
        email_confirmed_at: "2026-09-13T00:00:00Z",
      });
    if (url.includes("tracker_members?"))
      return Response.json([{ user_id: owner }]);
    if (url.endsWith("/rpc/tracker_load_v2")) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        actor: owner,
        wid: other,
      });
      loadCalls++;
      return Response.json(canonical);
    }
    if (url.endsWith("/rpc/tracker_save_v2")) {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, {
        actor: owner,
        wid: other,
        expected: 0,
        next_state: canonical,
      });
      return Response.json({ ...canonical, revision: 1 });
    }
    throw new Error("Unexpected request");
  };
  const loaded = await handle(req("/v2/tracker"), env, fetcher);
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), canonical);
  assert.equal(loadCalls, 1);
  const saved = await handle(
    req("/v2/tracker", "PUT", canonical),
    env,
    fetcher,
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { ...canonical, revision: 1 });
  assert.equal(loadCalls, 1);
});
test("API maps v2 atomic save conflict to 409 and does not expose backend secrets", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: owner,
        email_confirmed_at: "2026-09-13T00:00:00Z",
      });
    if (url.includes("tracker_members?"))
      return Response.json([{ user_id: owner }]);
    return Response.json(
      { message: "CONFLICT test-server-key" },
      { status: 400 },
    );
  };
  const result = await handle(
    req("/v2/tracker", "PUT", initialState()),
    env,
    fetcher,
  );
  assert.equal(result.status, 409);
  assert.ok(!(await result.text()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test("API keeps legacy reads compatible and rejects outdated write clients", async () => {
  const canonical = initialState();
  const legacy = { ...canonical, version: 1, dataset: "real" };
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user"))
      return Response.json({
        id: owner,
        email_confirmed_at: "2026-09-13T00:00:00Z",
      });
    if (url.includes("tracker_members?"))
      return Response.json([{ user_id: owner }]);
    if (url.includes("tracker_workspaces?"))
      return Response.json([{ state: legacy }]);
    throw new Error("Unexpected request");
  };
  const loaded = await handle(req(`/workspaces/${other}`), env, fetcher);
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), legacy);
  for (const payload of [legacy, canonical]) {
    const saved = await handle(
      req(`/workspaces/${other}`, "PUT", payload),
      env,
      fetcher,
    );
    assert.equal(saved.status, 426);
    assert.match((await saved.json()).error, /outdated/);
  }
  const rejected = await handle(
    req(`/workspaces/${other}`, "PUT", { ...legacy, dataset: "demo" }),
    env,
    fetcher,
  );
  assert.equal(rejected.status, 426);
});
test("PostgreSQL protects rows, saves atomically, retains server audit and consumes invites once", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'), ('${other}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202609130001_shared_tracker.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const created = await db.query<{ id: string }>(
      "select public.tracker_create($1,$2::jsonb) as id",
      [owner, JSON.stringify(initialState())],
    );
    const wid = created.rows[0]!.id;
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from public.tracker_workspaces"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.tracker_create($1,$2::jsonb)", [
        owner,
        JSON.stringify(initialState()),
      ]),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.query("select * from public.tracker_history"),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    await assert.rejects(
      db.query("select public.tracker_save($1,$2,0,$3::jsonb)", [
        other,
        wid,
        JSON.stringify(initialState()),
      ]),
      /FORBIDDEN/,
    );
    await db.query("select public.tracker_save($1,$2,0,$3::jsonb)", [
      owner,
      wid,
      JSON.stringify(initialState()),
    ]);
    await assert.rejects(
      db.query("select public.tracker_save($1,$2,0,$3::jsonb)", [
        owner,
        wid,
        JSON.stringify(initialState()),
      ]),
      /CONFLICT/,
    );
    const history = await db.query<{ revision: number; actor_id: string }>(
      "select revision, actor_id from public.tracker_history order by revision",
    );
    assert.deepEqual(history.rows, [
      { revision: 0, actor_id: owner },
      { revision: 1, actor_id: owner },
    ]);
    await db.query(
      "insert into public.tracker_invites(token_hash,workspace_id) values ($1,$2)",
      ["test-hash", wid],
    );
    await db.query("select public.tracker_join($1,$2)", [other, "test-hash"]);
    await assert.rejects(
      db.query("select public.tracker_join($1,$2)", [owner, "test-hash"]),
      /INVALID_INVITE/,
    );
    await db.query("select public.tracker_save($1,$2,1,$3::jsonb)", [
      other,
      wid,
      JSON.stringify(initialState()),
    ]);
    const saved = await db.query<{ state: { revision: number } }>(
      "select state from public.tracker_workspaces where id=$1",
      [wid],
    );
    assert.equal(saved.rows[0]!.state.revision, 2);
    await db.query(
      "insert into public.tracker_invites(token_hash,workspace_id,expires_at) values ($1,$2,now()-interval '1 minute')",
      ["expired", wid],
    );
    await assert.rejects(
      db.query("select public.tracker_join($1,$2)", [other, "expired"]),
      /INVALID_INVITE/,
    );
    await db.exec("reset role");
    const beforeCleanup = await db.query(
      "select state, revision from public.tracker_workspaces",
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202609140001_retire_platform_flows.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("select state, revision from public.tracker_workspaces"))
        .rows,
      beforeCleanup.rows,
    );
    const counts = await db.query(
      "select (select count(*)::int from public.tracker_members) as members, (select count(*)::int from public.tracker_history) as history, (select count(*)::int from public.tracker_invites) as invites",
    );
    assert.deepEqual(counts.rows, [{ members: 2, history: 3, invites: 1 }]);
    const functions = await db.query(
      "select to_regprocedure('public.tracker_create(uuid,jsonb)') as create_fn, to_regprocedure('public.tracker_join(uuid,text)') as join_fn",
    );
    assert.deepEqual(functions.rows, [{ create_fn: null, join_fn: null }]);
    await db.exec("set role service_role");
    await assert.rejects(
      db.query("select * from public.tracker_invites"),
      /permission denied/,
    );
    await db.query("select public.tracker_save($1,$2,2,$3::jsonb)", [
      owner,
      wid,
      JSON.stringify(initialState()),
    ]);
    await db.query("select public.tracker_save($1,$2,3,$3::jsonb)", [
      other,
      wid,
      JSON.stringify(initialState()),
    ]);
    await assert.rejects(
      db.query("select public.tracker_save($1,$2,3,$3::jsonb)", [
        owner,
        wid,
        JSON.stringify(initialState()),
      ]),
      /CONFLICT/,
    );
  } finally {
    await db.close();
  }
});
