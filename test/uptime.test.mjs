import test from "node:test";
import assert from "node:assert/strict";
test("uptime check reports a failing page and passes a healthy one", async () => {
  const real = globalThis.fetch;
  const ok = (body, type = "application/json") => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": type } });
  try {
    globalThis.fetch = async u => {
      const p = new URL(u).pathname;
      if (p === "/") return ok("<html></html>", "text/html");
      if (p === "/data.json") return ok({ events: [{ id: 1 }] });
      if (p === "/world-events.json") return ok({ events: [] });
      if (p === "/prices.json") return ok({});
      if (p === "/weekly.json") return ok({ items: [{ image: "/infographics/a.png" }] });
      if (p === "/infographics/a.png") return ok("x", "image/png");
      return new Response("", { status: 404 });
    };
    const { runChecks } = await import("../scripts/uptime.mjs");
    assert.deepEqual(await runChecks(), []);
    globalThis.fetch = async u => new URL(u).pathname === "/infographics/a.png" ? new Response("", { status: 404 }) : (await (async () => { throw new Error("skip"); })().catch(() => ok({ events: [{ id: 1 }], items: [{ image: "/infographics/a.png" }] }, "text/html")));
    const bad = await runChecks();
    assert.ok(bad.some(p => /R2 picture/.test(p)));
  } finally { globalThis.fetch = real; }
});
