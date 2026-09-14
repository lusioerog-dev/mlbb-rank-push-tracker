import { z } from "zod";
import {
  readState,
  writeCompatibleState,
} from "../../packages/tracker/compatibility";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGIN: string;
  SHARED_WORKSPACE_ID: string;
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
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
    const configured = uuid.safeParse(env.SHARED_WORKSPACE_ID);
    if (!configured.success)
      throw new HttpError(503, "The shared push is not configured.");
    const wid = configured.data;
    // Retain fixed-workspace read/save URLs for older deployed clients only.
    const legacyPath = `/workspaces/${wid}`;
    if (path !== "/tracker" && path !== legacyPath && path !== "/workspaces")
      throw new HttpError(404, "Not found.");
    if (request.method !== "GET" && request.method !== "PUT")
      throw new HttpError(405, "Method not allowed.");
    if (path === "/workspaces" && request.method !== "GET")
      throw new HttpError(405, "Method not allowed.");
    let body: unknown;
    if (request.method === "PUT") {
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
    const members = z
      .array(z.object({ user_id: uuid }))
      .parse(
        await db(
          `tracker_members?workspace_id=eq.${wid}&user_id=eq.${user.id}&select=user_id`,
        ),
      );
    if (!members.length)
      throw new HttpError(403, "You do not have access to this tracker.");
    if (path === "/workspaces") {
      response = json([wid]);
    } else if (request.method === "GET") {
      const rows = z
        .array(z.object({ state: z.unknown() }))
        .parse(await db(`tracker_workspaces?id=eq.${wid}&select=state`));
      if (!rows[0]) throw new HttpError(404, "Tracker not found.");
      response = json(writeCompatibleState(readState(rows[0].state)));
    } else {
      const next = readState(body);
      response = json(
        await db("rpc/tracker_save", "POST", {
          actor: user.id,
          wid,
          expected: next.revision,
          next_state: writeCompatibleState(next),
        }),
      );
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
export default { fetch: (request: Request, env: Env) => handle(request, env) };
