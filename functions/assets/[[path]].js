export async function onRequest(context) {
    const { request, env } = context;

    if (!["GET", "HEAD"].includes(request.method)) {
        return new Response("Method not allowed", {
            status: 405
        });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));

    const object = request.method === "HEAD"
        ? await env.ASSETS_BUCKET.head(key)
        : await env.ASSETS_BUCKET.get(key);

    if (!object) {
        return new Response("Asset not found: " + key, {
            status: 404
        });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);

    headers.set("ETag", object.httpEtag);
    headers.set("Content-Length", String(object.size));
    headers.set("Cache-Control", "no-store");

    return new Response(
        request.method === "HEAD" ? null : object.body,
        { headers }
    );
}