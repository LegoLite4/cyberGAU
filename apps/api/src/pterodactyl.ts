import { advertiseHost, env, pterodactylConfigured } from "./db";

type Json = Record<string, unknown>;

export type GameSettings = {
  map: string;
  slots: number;
  hostname: string;
  password: string;
  gameMode: string;
  gameType: string;
};

function panelUrl(): string {
  return env("PTERODACTYL_URL").replace(/\/$/, "");
}

async function panelFetch(path: string, key: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "Application/vnd.pterodactyl.v1+json");
  if (init?.body) headers.set("Content-Type", "application/json");
  return fetch(`${panelUrl()}${path}`, { ...init, headers });
}

async function readJson(res: Response): Promise<Json> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { raw: text };
  }
}

export async function syncPanelServers(): Promise<void> {
  if (!pterodactylConfigured()) return;
  const { prisma } = await import("./db");
  const res = await panelFetch("/api/application/servers?include=allocations&per_page=100", env("PTERODACTYL_APP_KEY"));
  if (!res.ok) return;
  const body = await readJson(res);
  const rows = Array.isArray(body.data) ? body.data : [];
  for (const row of rows) {
    const attrs = (row as Json).attributes as Json | undefined;
    if (!attrs) continue;
    const name = String(attrs.name ?? "");
    if (!name.startsWith("cybergau-")) continue;
    const identifier = String(attrs.identifier ?? "");
    const id = Number(attrs.id);
    const alloc = extractAllocation(attrs);
    await prisma.serverSlot.upsert({
      where: { identifier },
      update: {
        label: name,
        pterodactylId: id,
        allocationHost: alloc.host,
        allocationPort: alloc.port,
      },
      create: {
        label: name,
        identifier,
        pterodactylId: id,
        allocationHost: alloc.host,
        allocationPort: alloc.port,
        status: "free",
        purpose: "pool",
      },
    });
  }
}

function extractAllocation(attrs: Json): { host: string | null; port: number | null } {
  const relationships = attrs.relationships as Json | undefined;
  const allocations = relationships?.allocations as Json | undefined;
  const data = allocations?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { host: advertiseHost(), port: null };
  }
  const first = (data[0] as Json).attributes as Json | undefined;
  const port = first?.port ? Number(first.port) : null;
  return { host: advertiseHost(), port };
}

export async function configureAndStart(slot: {
  pterodactylId: number | null;
  identifier: string | null;
}, settings: GameSettings): Promise<{ host: string; port: number }> {
  if (!pterodactylConfigured()) {
    throw new Error("Игровой пул не настроен (нет ключей панели)");
  }
  if (!slot.pterodactylId || !slot.identifier) {
    throw new Error("Нет свободного сервера");
  }
  const appKey = env("PTERODACTYL_APP_KEY");
  const clientKey = env("PTERODACTYL_CLIENT_KEY");
  const currentRes = await panelFetch(`/api/application/servers/${slot.pterodactylId}`, appKey);
  if (!currentRes.ok) throw new Error("Панель не отдала настройки сервера");
  const current = await readJson(currentRes);
  const attrs = (current.attributes ?? {}) as Json;
  const container = (attrs.container ?? {}) as Json;
  const environment = {
    ...((container.environment as Json | undefined) ?? {}),
    SERVER_NAME: settings.hostname,
    SRCDS_MAP: settings.map,
    GAME_MODE: settings.gameMode,
    GAME_TYPE: settings.gameType,
    MAX_PLAYERS: String(settings.slots),
    SERVER_PASSWORD: settings.password.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30),
    HOSTNAME: settings.hostname,
  };
  const startup = String(container.startup_command ?? attrs.invocation ?? "");
  const image = String(container.image ?? env("PTERODACTYL_DOCKER_IMAGE", "ghcr.io/ptero-eggs/steamcmd:sniper"));
  const egg = Number(attrs.egg);
  const patch = await panelFetch(`/api/application/servers/${slot.pterodactylId}/startup`, appKey, {
    method: "PATCH",
    body: JSON.stringify({
      startup,
      environment,
      egg,
      image,
      skip_scripts: false,
    }),
  });
  if (!patch.ok) {
    const details = await readJson(patch);
    throw new Error(`Не удалось обновить сервер: ${JSON.stringify(details.errors ?? details)}`);
  }

  const power = await panelFetch(`/api/client/servers/${slot.identifier}/power`, clientKey, {
    method: "POST",
    body: JSON.stringify({ signal: "start" }),
  });
  if (!power.ok && power.status !== 204) {
    throw new Error("Панель не запустила сервер");
  }

  const deadline = Date.now() + 180_000;
  let port: number | null = null;
  while (Date.now() < deadline) {
    const stateRes = await panelFetch(`/api/client/servers/${slot.identifier}/resources`, clientKey);
    const stateBody = await readJson(stateRes);
    const stateAttrs = (stateBody.attributes ?? {}) as Json;
    const state = String(stateAttrs.current_state ?? "");
    const details = await panelFetch(`/api/client/servers/${slot.identifier}?include=allocations`, clientKey);
    const detailsBody = await readJson(details);
    const detailAttrs = (detailsBody.attributes ?? {}) as Json;
    const allocs = ((detailAttrs.relationships as Json | undefined)?.allocations as Json | undefined)?.data;
    if (Array.isArray(allocs) && allocs[0]) {
      const portValue = ((allocs[0] as Json).attributes as Json | undefined)?.port;
      if (portValue) port = Number(portValue);
    }
    if (state === "running") break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (!port) throw new Error("Сервер не отдал порт");
  return { host: advertiseHost(), port };
}

export async function stopServer(identifier: string | null): Promise<void> {
  if (!pterodactylConfigured() || !identifier) return;
  await panelFetch(`/api/client/servers/${identifier}/power`, env("PTERODACTYL_CLIENT_KEY"), {
    method: "POST",
    body: JSON.stringify({ signal: "stop" }),
  });
}
