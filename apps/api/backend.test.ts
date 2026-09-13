import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { handle } from "./index";
import { initialState } from "../../packages/tracker/seed";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
  ALLOWED_ORIGIN: "https://tracker.example",
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
test("API verifies identity and refuses nonmembers, demo imports and invalid payloads", async () => {
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
        req("/workspaces", "POST", initialState("demo")),
        env,
        fetcher,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handle(req("/workspaces", "POST", {}), env, fetcher)).status,
    400,
  );
});
test("API maps atomic save conflict to 409 and does not expose backend secrets", async () => {
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
    req(`/workspaces/${other}`, "PUT", initialState("real")),
    env,
    fetcher,
  );
  assert.equal(result.status, 409);
  assert.ok(!(await result.text()).includes(env.SUPABASE_SERVICE_ROLE_KEY));
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
      [owner, JSON.stringify(initialState("real"))],
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
        JSON.stringify(initialState("real")),
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
        JSON.stringify(initialState("real")),
      ]),
      /FORBIDDEN/,
    );
    await db.query("select public.tracker_save($1,$2,0,$3::jsonb)", [
      owner,
      wid,
      JSON.stringify(initialState("real")),
    ]);
    await assert.rejects(
      db.query("select public.tracker_save($1,$2,0,$3::jsonb)", [
        owner,
        wid,
        JSON.stringify(initialState("real")),
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
      JSON.stringify(initialState("real")),
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
  } finally {
    await db.close();
  }
});
