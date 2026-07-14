// Minimal PostgREST stand-in for end-to-end QA.
// 201 on insert; 409/23505 for emails containing "dup@".
import http from "node:http";

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      console.log(new Date().toISOString(), req.method, req.url, body);
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
  .listen(54321, () => console.log("supabase stub listening on 54321"));
