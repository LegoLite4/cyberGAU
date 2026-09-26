import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Prisma, User } from "@prisma/client";
import { env, prisma, publicWebUrl } from "./db";

const COOKIE = "cybergau_session";

export function steamLoginUrl(): string {
  const web = publicWebUrl();
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${web}/backend/auth/steam/callback`,
    "openid.realm": web,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `https://steamcommunity.com/openid/login?${params.toString()}`;
}

export async function verifySteam(query: Record<string, string | string[] | undefined>): Promise<string> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("openid.") || value === undefined) continue;
    body.set(key, Array.isArray(value) ? value[0] : value);
  }
  body.set("openid.mode", "check_authentication");
  const response = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!text.includes("is_valid:true")) {
    throw new Error("Steam не подтвердил вход");
  }
  const claimed = body.get("openid.claimed_id") ?? "";
  const match = claimed.match(/\/(\d{17})$/);
  if (!match) throw new Error("Steam не вернул идентификатор");
  return match[1];
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, n, r, p, saltHex, hashHex] = stored.split("$");
  if (kind !== "scrypt" || !n || !r || !p || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

type SteamProfile = { avatarUrl: string | null; cs2Hours: number | null };

async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  let avatarUrl: string | null = null;
  let cs2Hours: number | null = null;
  const key = env("STEAM_WEB_API_KEY");
  if (!key) return { avatarUrl, cs2Hours };
  const summary = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`,
  );
  if (summary.ok) {
    const payload = (await summary.json()) as {
      response?: { players?: Array<{ avatarfull?: string }> };
    };
    const player = payload.response?.players?.[0];
    if (player?.avatarfull) avatarUrl = player.avatarfull;
  }
  const games = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=0&appids_filter[0]=730`,
  );
  if (games.ok) {
    const payload = (await games.json()) as {
      response?: { games?: Array<{ appid?: number; playtime_forever?: number }> };
    };
    const cs2 = payload.response?.games?.find((game) => game.appid === 730);
    if (cs2?.playtime_forever !== undefined) cs2Hours = Math.floor(cs2.playtime_forever / 60);
  }
  return { avatarUrl, cs2Hours };
}

export async function linkSteam(userId: string, steamId: string): Promise<User> {
  const taken = await prisma.user.findUnique({ where: { steamId } });
  if (taken && taken.id !== userId) {
    throw new Error("Этот Steam уже привязан к другому аккаунту");
  }
  const profile = await fetchSteamProfile(steamId);
  return prisma.user.update({
    where: { id: userId },
    data: {
      steamId,
      avatarUrl: profile.avatarUrl,
      cs2Hours: profile.cs2Hours,
    },
  });
}

export type PublicSkinState = {
  linked: boolean;
  count: number;
  syncedAt: string | null;
  error: string | null;
};

function skinCount(items: Prisma.JsonValue | null | undefined): number {
  if (!items || typeof items !== "object" || Array.isArray(items)) return 0;
  const record = items as { weapons?: Record<string, unknown>; knife?: unknown; gloves?: unknown };
  const weapons = record.weapons && typeof record.weapons === "object" ? Object.keys(record.weapons).length : 0;
  return weapons + (record.knife ? 1 : 0) + (record.gloves ? 1 : 0);
}

export async function toPublicUser(user: User) {
  const loadout = await prisma.skinLoadout.findUnique({ where: { userId: user.id } });
  const skins: PublicSkinState = {
    linked: Boolean(user.steamId),
    count: skinCount(loadout?.items),
    syncedAt: loadout?.syncedAt.toISOString() ?? null,
    error: loadout?.error ?? null,
  };
  return {
    id: user.id,
    username: user.username,
    steamId: user.steamId,
    personaName: user.personaName,
    avatarUrl: user.avatarUrl,
    cs2Hours: user.cs2Hours,
    skins,
  };
}

export async function openSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env("COOKIE_SECURE") === "1",
    expires: expiresAt,
  });
}

export async function currentUser(request: FastifyRequest): Promise<User | null> {
  const token = request.cookies[COOKIE];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

export async function requireUser(request: FastifyRequest): Promise<User> {
  const user = await currentUser(request);
  if (!user) {
    const error = new Error("Нужно войти");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return user;
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[COOKIE];
  if (token) await prisma.session.deleteMany({ where: { token } });
  reply.clearCookie(COOKIE, { path: "/" });
}

