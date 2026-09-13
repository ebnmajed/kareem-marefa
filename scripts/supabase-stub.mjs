// Minimal PostgREST stand-in for end-to-end QA.
// 201 on insert; 409/23505 for emails containing "dup@".
//
// Port 54331, deliberately NOT 54321: local Supabase (`supabase start`) binds
// 54321 through Kong, and when it is running the stub silently loses the bind
// and the app talks to the local database instead. Same failure shape as the
// production incident in DEC-023 — the stub looked started and was not used.
// Override with STUB_PORT.
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 54331);
const MARKER = "kareem-marefa-qa-stub";

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      console.log(new Date().toISOString(), req.method, req.url, body);
      // Identity probe. qa-run.mjs asserts on this so "something answered" can
      // never be mistaken for "the stub answered".
      if (req.url === "/__stub") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ marker: MARKER, pid: process.pid }));
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/rest/v1/registrations")) {
        try {
          const row = JSON.parse(body || "{}");
          if (String(row.email ?? "").includes("dup@")) {
            res.writeHead(409, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                code: "23505",
                message: "duplicate key value violates unique constraint",
                details: null,
                hint: null,
              }),
            );
            return;
          }
          res.writeHead(201, { "content-type": "application/json" });
          res.end("");
        } catch {
          res.writeHead(400);
          res.end();
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
  })
  .on("error", (err) => {
    // Never fail silently: an unbound stub means the app is talking to
    // something else, which is the whole bug this file exists to prevent.
    console.error(
      err.code === "EADDRINUSE"
        ? `supabase stub CANNOT BIND :${PORT} — something else owns it. Refusing to start.`
        : `supabase stub failed: ${err.message}`,
    );
    process.exit(1);
  })
  .listen(PORT, () => console.log(`supabase stub listening on ${PORT} (${MARKER})`));
