const IMAGE_PATH =
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

function failure(status, message, headers = {}) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return failure(405, "Method not allowed", { Allow: "GET, HEAD" });
    const url = new URL(request.url);
    if (url.pathname === "/health" && !url.search) {
      return Response.json(
        { service: "alps-media", ready: Boolean(env.MEDIA_BUCKET) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (url.search || !IMAGE_PATH.test(url.pathname))
      return failure(404, "Not found");
    if (!env.MEDIA_BUCKET)
      return failure(503, "Image storage is not configured");
    try {
      const key = url.pathname.slice(1);
      const object =
        await env.MEDIA_BUCKET[request.method === "HEAD" ? "head" : "get"](key);
      if (!object) return failure(404, "Image not found");
      const headers = new Headers({
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
        "Content-Length": String(object.size),
      });
      const tags = request.headers
        .get("If-None-Match")
        ?.split(",")
        .map((tag) => tag.trim().replace(/^W\//, ""));
      if (tags?.some((tag) => tag === "*" || tag === object.httpEtag)) {
        headers.delete("Content-Length");
        return new Response(null, { status: 304, headers });
      }
      return new Response(request.method === "HEAD" ? null : object.body, {
        headers,
      });
    } catch {
      return failure(502, "Image storage is temporarily unavailable");
    }
  },
};
