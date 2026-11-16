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
    if (!type.startsWith("image/") && !type.startsWith("video/")) return json({ error: "bad type" }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 5.5 * 1024 * 1024) return json({ error: "too big" }, 413);
    const key = crypto.randomUUID() + "." + ext;
    await getStore("imgs").set(key, buf, { metadata: { type } });
    return json({ url: "/i/" + key });
  }

  if (path.startsWith("/i/")) {
    const key = decodeURIComponent(path.slice(3));
    const r = await getStore("imgs").getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    const total = r.data.byteLength;
    const h = { "content-type": r.metadata?.type || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes" };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
    if (m && (m[1] || m[2])) {
      let st = m[1] === "" ? total - parseInt(m[2]) : parseInt(m[1]);
      let en = m[1] !== "" && m[2] !== "" ? parseInt(m[2]) : total - 1;
      en = Math.min(en, total - 1); st = Math.max(st, 0);
      if (st > en) return new Response("", { status: 416, headers: { "content-range": "bytes */" + total } });
      return new Response(r.data.slice(st, en + 1), { status: 206, headers: { ...h, "content-range": "bytes " + st + "-" + en + "/" + total, "content-length": String(en - st + 1) } });
    }
    return new Response(r.data, { headers: { ...h, "content-length": String(total) } });
  }

  return new Response("Not found", { status: 404 });
};

export const config = { path: ["/api/data", "/api/upload", "/i/*"] };
