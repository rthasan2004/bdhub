import { getStore } from "@netlify/blobs";

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const authed = (req) => !!process.env.ADMIN_PASSWORD && req.headers.get("x-admin") === process.env.ADMIN_PASSWORD;

export default async (req) => {
  const path = new URL(req.url).pathname;

  if (path === "/api/data") {
    const store = getStore("site");
    if (req.method === "GET") return json((await store.get("site", { type: "json" })) || {});
    if (!authed(req)) return json({ error: "no" }, 401);
    if (req.method === "POST") return json({ ok: true });
    if (req.method === "PUT") {
      const d = await req.json();
      if (!d || !Array.isArray(d.videos)) return json({ error: "bad" }, 400);
      await store.setJSON("site", d);
      return json({ ok: true });
    }
  }

  if (path === "/api/upload" && req.method === "POST") {
    if (!authed(req)) return json({ error: "no" }, 401);
    const ext = (req.headers.get("x-ext") || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
    const type = req.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return json({ error: "image only" }, 400);
    const key = crypto.randomUUID() + "." + ext;
    await getStore("imgs").set(key, await req.arrayBuffer(), { metadata: { type } });
    return json({ url: "/i/" + key });
  }

  if (path.startsWith("/i/")) {
    const key = decodeURIComponent(path.slice(3));
    const r = await getStore("imgs").getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }

  return new Response("Not found", { status: 404 });
};

export const config = { path: ["/api/data", "/api/upload", "/i/*"] };
