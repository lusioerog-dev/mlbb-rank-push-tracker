import { z } from "zod";
import { stateSchema } from "../../packages/tracker/model";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGIN: string;
}
const uuid = z.string().uuid();
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && origin !== env.ALLOWED_ORIGIN)
    return json({ error: "Origin not allowed." }, 403);
  const cors = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  };
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  let response: Response;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      throw new HttpError(503, "Shared storage is not configured.");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      throw new HttpError(401, "Sign in to continue.");
    const auth = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: authorization,
      },
    });
    if (!auth.ok)
      throw new HttpError(
        auth.status >= 500 ? 503 : 401,
        "Could not verify your session. Please sign in again.",
      );
    const user = z
      .object({
        id: uuid,
        email_confirmed_at: z.string().nullable().optional(),
      })
      .parse(await auth.json());
    if (!user.email_confirmed_at)
      throw new HttpError(
        403,
        "Confirm your email before opening a shared tracker.",
      );
    const db = async (
      path: string,
      method = "GET",
      body?: unknown,
    ): Promise<unknown> => {
      const result = await fetcher(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!result.ok) {
        const message = await result.text();
        if (message.includes("CONFLICT"))
          throw new HttpError(
            409,
            "Someone saved changes first. Refresh the tracker before trying again. Your form is still open.",
          );
        if (message.includes("INVALID_INVITE"))
          throw new HttpError(
            400,
            "This invitation has expired or was already used.",
          );
        if (message.includes("FORBIDDEN"))
          throw new HttpError(403, "You do not have access to this tracker.");
        throw new HttpError(
          503,
          "Shared storage is unavailable. Your changes have not been confirmed.",
        );
      }
      const text = await result.text();
      return text ? JSON.parse(text) : null;
    };
    const path = new URL(request.url).pathname;
    let body: unknown;
    if (request.method === "POST" || request.method === "PUT") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        throw new HttpError(415, "Send JSON data.");
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) {
            await reader.cancel();
            throw new HttpError(413, "Tracker is too large (maximum 4 MB).");
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new HttpError(400, "Invalid JSON.");
      }
    }
    if (path === "/workspaces" && request.method === "GET") {
      const rows = z
        .array(z.object({ workspace_id: uuid }))
        .parse(
          await db(`tracker_members?user_id=eq.${user.id}&select=workspace_id`),
        );
      response = json(rows.map((r) => r.workspace_id));
    } else if (path === "/workspaces" && request.method === "POST") {
      const state = stateSchema.parse(body);
      if (state.dataset !== "real")
        throw new HttpError(400, "Only real trackers can be shared.");
      response = json(
        {
          id: await db("rpc/tracker_create", "POST", {
            actor: user.id,
            initial_state: state,
          }),
        },
        201,
      );
    } else if (path === "/join" && request.method === "POST") {
      const { code } = z
        .object({ code: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(body);
      response = json({
        id: await db("rpc/tracker_join", "POST", {
          actor: user.id,
          invite_hash: await hash(code),
        }),
      });
    } else {
      const match = /^\/workspaces\/([^/]+)(\/invite)?$/.exec(path);
      if (!match) throw new HttpError(404, "Not found.");
      const wid = uuid.parse(match[1]);
      const members = z
        .array(z.object({ user_id: uuid }))
        .parse(
          await db(
            `tracker_members?workspace_id=eq.${wid}&user_id=eq.${user.id}&select=user_id`,
          ),
        );
      if (!members.length)
        throw new HttpError(403, "You do not have access to this tracker.");
      if (!match[2] && request.method === "GET") {
        const rows = z
          .array(z.object({ state: stateSchema }))
          .parse(await db(`tracker_workspaces?id=eq.${wid}&select=state`));
        if (!rows[0]) throw new HttpError(404, "Tracker not found.");
        response = json(rows[0].state);
      } else if (!match[2] && request.method === "PUT") {
        const next = stateSchema.parse(body);
        if (next.dataset !== "real")
          throw new HttpError(
            400,
            "Demo data cannot replace a shared tracker.",
          );
        response = json(
          await db("rpc/tracker_save", "POST", {
            actor: user.id,
            wid,
            expected: next.revision,
            next_state: next,
          }),
        );
      } else if (match[2] && request.method === "POST") {
        const owners = z
          .array(z.object({ owner_id: uuid }))
          .parse(
            await db(
              `tracker_workspaces?id=eq.${wid}&owner_id=eq.${user.id}&select=owner_id`,
            ),
          );
        if (!owners.length)
          throw new HttpError(
            403,
            "Only the tracker owner can invite players.",
          );
        const code = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        await db("tracker_invites", "POST", {
          workspace_id: wid,
          token_hash: await hash(code),
        });
        response = json({ code });
      } else throw new HttpError(405, "Method not allowed.");
    }
  } catch (error) {
    response =
      error instanceof HttpError
        ? json({ error: error.message }, error.status)
        : error instanceof z.ZodError
          ? json({ error: "Invalid tracker data or request." }, 400)
          : json(
              { error: "Could not connect to shared storage. Try again." },
              503,
            );
  }
  for (const [key, value] of Object.entries(cors))
    response.headers.set(key, value);
  return response;
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export default { fetch: (request: Request, env: Env) => handle(request, env) };
