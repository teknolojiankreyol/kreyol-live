// Sends captions to ProPresenter 7 through its built-in Network API.
// In ProPresenter: Settings → Network → Enable Network, note the port.
// Create a Message (e.g. named "Kreyol") whose text is a single Text token (e.g. named "Text").

export const settings = {
  enabled: false,
  host: "127.0.0.1",
  port: 50001,
  messageId: "Kreyol", // message name, UUID, or index
  tokenName: "Text",
};

const base = () => `http://${settings.host}:${settings.port}/v1`;

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(base() + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`ProPresenter replied ${res.status} ${res.statusText}`);
  const type = res.headers.get("content-type") || "";
  return type.includes("json") ? res.json() : res.text();
}

export async function showCaption(text) {
  if (!settings.enabled) return;
  await call(`/message/${encodeURIComponent(settings.messageId)}/trigger`, {
    method: "POST",
    body: [{ name: settings.tokenName, text: { text } }],
  });
}

export async function clearCaption() {
  if (!settings.enabled) return;
  await call(`/message/${encodeURIComponent(settings.messageId)}/clear`);
}

// Lists the messages in ProPresenter so the operator can confirm the connection
export async function testConnection() {
  const messages = await call("/messages");
  return Array.isArray(messages)
    ? messages.map((m) => m?.id?.name ?? m?.name ?? JSON.stringify(m?.id ?? m))
    : messages;
}
