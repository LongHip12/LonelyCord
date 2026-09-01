import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendFile(response, filePath) {
  try {
    const file = statSync(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer((request, response) => {
  const requestPath = new URL(request.url || "/", "http://localhost").pathname;
  const safePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const requestedFile = join(root, safePath === "/" ? "index.html" : safePath);
  sendFile(response, requestedFile);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Lonely Cord listening on port ${port}`);
});