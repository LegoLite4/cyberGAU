import { randomBytes } from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
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

export async function upsertSteamUser(steamId: string): Promise<User> {
  let personaName = `steam_${steamId.slice(-4)}`;
  let avatarUrl: string | null = null;
  let cs2Hours: number | null = null;
  const key = env("STEAM_WEB_API_KEY");
  if (key) {
    const summary = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`,
    );
    if (summary.ok) {
      const payload = (await summary.json()) as {
        response?: { players?: Array<{ personaname?: string; avatarfull?: string }> };
      };
      const player = payload.response?.players?.[0];
      if (player?.personaname) personaName = player.personaname;
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
  }

  return prisma.user.upsert({
    where: { steamId },
    update: { personaName, avatarUrl, cs2Hours },
    create: { steamId, personaName, avatarUrl, cs2Hours },
  });
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
    const error = new Error("Нужен вход через Steam");
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

export function publicUser(user: User) {
  return {
    id: user.id,
    steamId: user.steamId,
    personaName: user.personaName,
    avatarUrl: user.avatarUrl,
    cs2Hours: user.cs2Hours,
  };
}
