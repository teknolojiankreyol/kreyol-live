import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { translate, translatorInfo } from "./translator.js";
import * as pro from "./propresenter.js";

const PORT = Number(process.env.PORT) || 3000;
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");

// ---- caption state ----
const captions = []; // { id, en, ht, at }
const clients = new Set(); // open Server-Sent Events connections
let nextSeq = 1; // order lines arrive in
let nextToEmit = 1; // translations can finish out of order; emit in order
const finished = new Map(); // seq -> caption | null
let proQueue = Promise.resolve();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function flushInOrder() {
  while (finished.has(nextToEmit)) {
    const cap = finished.get(nextToEmit);
    finished.delete(nextToEmit);
    nextToEmit++;
    if (!cap) continue;
    captions.push(cap);
    if (captions.length > 200) captions.shift();
    broadcast("caption", cap);
    // One ProPresenter request at a time so captions can't arrive out of order
    proQueue = proQueue
      .then(() => pro.showCaption(cap.ht))
      .catch((e) => broadcast("status", { propresenter: e.cause?.code || e.message }));
  }
}

async function handleLine(en) {
  const seq = nextSeq++;
  const context = captions.slice(-6).map(({ en, ht }) => ({ en, ht }));
  try {
    const ht = await translate(en, context);
    finished.set(seq, ht ? { id: seq, en, ht, at: Date.now() } : null);
    return ht;
  } catch (e) {
    finished.set(seq, null);
    broadcast("status", { translator: e.message });
    throw e;
  } finally {
    flushInOrder();
  }
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return "localhost";
}

// ---- http helpers ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Body too large");
  }
  return body ? JSON.parse(body) : {};
}

function serveFile(res, file) {
  fs.readFile(path.join(PUBLIC, file), (err, data) => {
    if (err) return sendJson(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const PAGES = { "/": "phone.html", "/display": "display.html", "/operator": "operator.html" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    if (req.method === "GET" && PAGES[url.pathname]) return serveFile(res, PAGES[url.pathname]);
    if (req.method === "GET" && /^\/[\w-]+\.(css|js)$/.test(url.pathname)) return serveFile(res, url.pathname.slice(1));

    switch (route) {
      case "GET /events": {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(`event: history\ndata: ${JSON.stringify(captions.slice(-30))}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      case "POST /api/line": {
        const { text } = await readJson(req);
        const en = String(text || "").trim();
        if (!en) return sendJson(res, 400, { error: "No text" });
        const ht = await handleLine(en.slice(0, 1000));
        return sendJson(res, 200, { en, ht });
      }

      case "POST /api/clear": {
        captions.length = 0;
        broadcast("clear", {});
        proQueue = proQueue.then(() => pro.clearCaption()).catch(() => {});
        await proQueue;
        return sendJson(res, 200, { ok: true });
      }

      case "GET /api/info": {
        const phoneUrl = `http://${lanAddress()}:${PORT}/`;
        const qr = await QRCode.toString(phoneUrl, { type: "svg", margin: 1 });
        return sendJson(res, 200, {
          phoneUrl,
          displayUrl: `http://${lanAddress()}:${PORT}/display`,
          qr,
          model: translatorInfo.model,
          propresenter: pro.settings,
          viewers: clients.size,
        });
      }

      case "POST /api/propresenter": {
        const body = await readJson(req);
        for (const key of ["host", "messageId", "tokenName"]) if (typeof body[key] === "string") pro.settings[key] = body[key].trim();
        if (body.port) pro.settings.port = Number(body.port);
        if (typeof body.enabled === "boolean") pro.settings.enabled = body.enabled;
        return sendJson(res, 200, pro.settings);
      }

      case "POST /api/propresenter/test": {
        try {
          const messages = await pro.testConnection();
          return sendJson(res, 200, { ok: true, messages });
        } catch (e) {
          return sendJson(res, 200, { ok: false, error: e.cause?.code || e.message });
        }
      }
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  const ip = lanAddress();
  console.log(`
  Kreyòl Live is running  (translator: ${translatorInfo.model})

  Operator (open in Chrome on this computer):  http://localhost:${PORT}/operator
  Phones (same Wi-Fi):                         http://${ip}:${PORT}/
  Big-screen / OBS caption page:               http://${ip}:${PORT}/display
`);
});
