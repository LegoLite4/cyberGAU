export type User = {
  id: string;
  username: string | null;
  steamId: string | null;
  personaName: string;
  avatarUrl: string | null;
  cs2Hours: number | null;
  skins: {
    linked: boolean;
    count: number;
    syncedAt: string | null;
    error: string | null;
  };
};

export type Lobby = {
  id: string;
  title: string;
  visibility: "public" | "password" | "private";
  format: string;
  map: string;
  slots: number;
  maxPing: number | null;
  minHours: number | null;
  hasPassword: boolean;
  status: string;
  inviteCode: string;
  owner: { id: string; personaName: string; avatarUrl: string | null };
  members: Array<{ id: string; personaName: string; avatarUrl: string | null; pingMs: number | null; cs2Hours: number | null }>;
  connect: string | null;
  error: string | null;
  isOwner: boolean;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type SkinItem = {
  paint: number;
  wear: number;
  seed: number;
  defindex: number;
  classname: string;
};

export type SkinItems = {
  weapons: Record<string, SkinItem>;
  knife: SkinItem | null;
  gloves: SkinItem | null;
};

export type CatalogWeapon = {
  classname: string;
  name: string;
  kind: "weapon" | "knife" | "gloves";
  group: string;
  skins: Array<{ name: string; image: string; paint: number }>;
};

export type ModeCard = {
  id: string;
  title: string;
  summary: string;
  map: string;
  slots: number;
  status: string;
  connect: string | null;
};

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  author: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Ошибка запроса");
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>("/auth/me"),
  register: (username: string, password: string) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  syncSkins: () => request<{ user: User }>("/skins/sync", { method: "POST" }),
  skinCatalog: () => request<{ weapons: CatalogWeapon[] }>("/skins/catalog"),
  mySkins: () => request<{ items: SkinItems }>("/skins/mine"),
  saveSkins: (items: SkinItems) =>
    request<{ user: User; items: SkinItems }>("/skins/loadout", { method: "PUT", body: JSON.stringify(items) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  lobbies: (query = "") => request<{ lobbies: Lobby[]; maps: string[]; formats: string[] }>(`/lobbies${query}`),
  lobby: (id: string) => request<Lobby>(`/lobbies/${id}`),
  invite: (code: string) => request<Lobby>(`/invites/${code}`),
  createLobby: (body: unknown) => request<Lobby>("/lobbies", { method: "POST", body: JSON.stringify(body) }),
  join: (id: string, body: unknown) => request<Lobby>(`/lobbies/${id}/join`, { method: "POST", body: JSON.stringify(body) }),
  start: (id: string) => request<Lobby>(`/lobbies/${id}/start`, { method: "POST" }),
  stop: (id: string) => request<Lobby>(`/lobbies/${id}/stop`, { method: "POST" }),
  messages: (id: string) => request<{ messages: ChatMessage[] }>(`/lobbies/${id}/messages`),
  sendMessage: (id: string, body: string) =>
    request<ChatMessage>(`/lobbies/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  modes: () => request<{ modes: ModeCard[] }>("/modes"),
  startMode: (id: string) => request<ModeCard>(`/modes/${id}/start`, { method: "POST" }),
  stopMode: (id: string) => request<ModeCard>(`/modes/${id}/stop`, { method: "POST" }),
  profile: () => request<{ user: User; history: Lobby[] }>("/profile"),
};

export async function measurePing(): Promise<number> {
  const started = performance.now();
  await fetch("/backend/health", { cache: "no-store" });
  return Math.round(performance.now() - started);
}

export function visibilityLabel(value: string): string {
  if (value === "public") return "Открытое";
  if (value === "password") return "С паролем";
  return "Скрытое";
}

export function statusLabel(value: string): string {
  if (value === "live") return "В игре";
  if (value === "starting") return "Запуск";
  if (value === "ended") return "Завершено";
  if (value === "offline") return "Выключен";
  return "Ожидание";
}
