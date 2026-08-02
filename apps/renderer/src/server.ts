import { createServer } from "node:http";

import { createHealthPayload } from "./health.js";

const port = Number.parseInt(process.env.PORT ?? "4310", 10);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(createHealthPayload()));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`MarkdownMint renderer listening on http://127.0.0.1:${port}`);
});
