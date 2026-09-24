import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { z } from "zod";
import { clearSession, currentUser, openSession, publicUser, requireUser, steamLoginUrl, upsertSteamUser, verifySteam } from "./auth";
import { FORMATS, MAPS, isFormat } from "./catalog";
import { prisma, publicWebUrl } from "./db";
import { ensureMockSlot, listLobbies, listModes, newInviteCode, startLobby, startMode, stopLobby, stopMode, toLobbyDto } from "./lobbies";
import { syncPanelServers } from "./pterodactyl";

const app = Fastify({ logger: true });

app.register(cookie);
app.register(cors, {
  origin: publicWebUrl(),
  credentials: true,
});

function statusOf(error: unknown): number {
  if (error && typeof error === "object" && "statusCode" in error) {
    return Number((error as { statusCode: number }).statusCode);
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("не найдено")) return 404;
  if (message.includes("только создатель") || message.includes("Нужен вход")) return 403;
  return 400;
}

app.get("/health", async () => ({ ok: true }));

app.get("/auth/steam", async (_request, reply) => {
  reply.redirect(steamLoginUrl());
});

app.get("/auth/steam/callback", async (request, reply) => {
  try {
    const steamId = await verifySteam(request.query as Record<string, string>);
    const user = await upsertSteamUser(steamId);
    await openSession(reply, user.id);
    reply.redirect(publicWebUrl());
  } catch (error) {
    reply.code(401).send({ error: error instanceof Error ? error.message : "Вход не выполнен" });
  }
});

app.get("/auth/me", async (request) => {
  const user = await currentUser(request);
  return { user: user ? publicUser(user) : null };
});

app.post("/auth/logout", async (request, reply) => {
  await clearSession(request, reply);
  return { ok: true };
});

app.get("/lobbies", async (request) => {
  const query = request.query as { map?: string; format?: string; visibility?: string };
  const user = await currentUser(request);
  return {
    lobbies: await listLobbies({ ...query, viewerId: user?.id }),
    maps: MAPS,
    formats: Object.keys(FORMATS),
  };
});

const createLobbySchema = z.object({
  title: z.string().trim().min(3).max(48),
  visibility: z.enum(["public", "password", "private"]),
  format: z.string(),
  map: z.string(),
  slots: z.number().int().min(2).max(32).optional(),
  password: z.string().regex(/^[A-Za-z0-9_-]{1,30}$/).optional(),
  maxPing: z.number().int().min(1).max(500).optional(),
  minHours: z.number().int().min(0).max(20000).optional(),
});

app.post("/lobbies", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = createLobbySchema.parse(request.body);
    if (!isFormat(body.format)) throw new Error("Неизвестный формат");
    if (!MAPS.includes(body.map as (typeof MAPS)[number])) throw new Error("Неизвестная карта");
    if (body.visibility === "password" && !body.password) throw new Error("Для закрытого лобби нужен пароль");
    const slots = body.slots ?? FORMATS[body.format].slots;
    const lobby = await prisma.lobby.create({
      data: {
        title: body.title,
        visibility: body.visibility,
        format: body.format,
        map: body.map,
        slots,
        password: body.password || null,
        maxPing: body.maxPing ?? null,
        minHours: body.minHours ?? null,
        inviteCode: newInviteCode(),
        ownerId: user.id,
        members: { create: { userId: user.id } },
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        serverSlot: true,
      },
    });
    reply.code(201);
    return toLobbyDto(lobby, user.id);
  } catch (error) {
    reply.code(statusOf(error));
    const message = error instanceof z.ZodError
      ? "Проверьте поля. Пароль: латиница, цифры, дефис или подчёркивание, до 30 символов."
      : error instanceof Error ? error.message : "Не удалось создать лобби";
    return { error: message };
  }
});

async function loadLobby(id: string) {
  return prisma.lobby.findUnique({
    where: { id },
    include: {
      owner: true,
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
      serverSlot: true,
    },
  });
}

app.get("/lobbies/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const lobby = await loadLobby(id);
  if (!lobby) return reply.code(404).send({ error: "Лобби не найдено" });
  const user = await currentUser(request);
  if (lobby.visibility === "private" && user?.id !== lobby.ownerId && !lobby.members.some((member) => member.userId === user?.id)) {
    return reply.code(404).send({ error: "Лобби не найдено" });
  }
  return toLobbyDto(lobby, user?.id);
});

app.get("/invites/:code", async (request, reply) => {
  const { code } = request.params as { code: string };
  const lobby = await prisma.lobby.findUnique({
    where: { inviteCode: code },
    include: {
      owner: true,
      members: { include: { user: true } },
      serverSlot: true,
    },
  });
  if (!lobby) return reply.code(404).send({ error: "Приглашение не найдено" });
  const user = await currentUser(request);
  return toLobbyDto(lobby, user?.id);
});

const joinSchema = z.object({
  password: z.string().optional(),
  pingMs: z.number().int().min(0).max(999).optional(),
});

app.post("/lobbies/:id/join", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = joinSchema.parse(request.body ?? {});
    const lobby = await loadLobby(id);
    if (!lobby || lobby.status === "ended") throw new Error("Лобби не найдено");
    if (lobby.members.some((member) => member.userId === user.id)) return toLobbyDto(lobby, user.id);
    if (lobby.password && body.password !== lobby.password) throw new Error("Неверный пароль");
    if (lobby.maxPing && (body.pingMs === undefined || body.pingMs > lobby.maxPing)) {
      throw new Error(`Пинг выше лимита ${lobby.maxPing} мс`);
    }
    if (lobby.minHours && (user.cs2Hours === null || user.cs2Hours < lobby.minHours)) {
      throw new Error(`Нужно не меньше ${lobby.minHours} часов в CS2`);
    }
    if (lobby.members.length >= lobby.slots) throw new Error("В лобби нет свободных мест");
    await prisma.lobbyMember.create({ data: { lobbyId: id, userId: user.id, pingMs: body.pingMs ?? null } });
    const updated = await loadLobby(id);
    return toLobbyDto(updated!, user.id);
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Не удалось войти" };
  }
});

app.post("/lobbies/:id/start", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return await startLobby(id, user.id);
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Не удалось запустить матч" };
  }
});

app.post("/lobbies/:id/stop", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return await stopLobby(id, user.id);
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Не удалось остановить матч" };
  }
});

app.get("/lobbies/:id/messages", async (request, reply) => {
  const { id } = request.params as { id: string };
  const lobby = await loadLobby(id);
  const user = await currentUser(request);
  if (!lobby) return reply.code(404).send({ error: "Лобби не найдено" });
  if (!user || !lobby.members.some((member) => member.userId === user.id)) {
    return reply.code(403).send({ error: "Чат доступен участникам лобби" });
  }
  const messages = await prisma.lobbyMessage.findMany({
    where: { lobbyId: id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return {
    messages: messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      author: message.user.personaName,
    })),
  };
});

const messageSchema = z.object({ body: z.string().trim().min(1).max(400) });

app.post("/lobbies/:id/messages", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = messageSchema.parse(request.body);
    const member = await prisma.lobbyMember.findUnique({ where: { lobbyId_userId: { lobbyId: id, userId: user.id } } });
    if (!member) throw new Error("Чат доступен участникам лобби");
    const message = await prisma.lobbyMessage.create({
      data: { lobbyId: id, userId: user.id, body: body.body },
      include: { user: true },
    });
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      author: message.user.personaName,
    };
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Сообщение не отправлено" };
  }
});

app.get("/modes", async () => ({ modes: await listModes() }));

app.post("/modes/:mode/start", async (request, reply) => {
  try {
    await requireUser(request);
    const { mode } = request.params as { mode: string };
    return await startMode(mode);
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Режим не запущен" };
  }
});

app.post("/modes/:mode/stop", async (request, reply) => {
  try {
    await requireUser(request);
    const { mode } = request.params as { mode: string };
    return await stopMode(mode);
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Режим не остановлен" };
  }
});

app.get("/profile", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const history = await prisma.lobby.findMany({
      where: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
      include: {
        owner: true,
        members: { include: { user: true } },
        serverSlot: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return { user: publicUser(user), history: history.map((lobby) => toLobbyDto(lobby, user.id)) };
  } catch (error) {
    reply.code(statusOf(error));
    return { error: error instanceof Error ? error.message : "Профиль недоступен" };
  }
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

async function main() {
  await syncPanelServers().catch((error) => app.log.warn(error));
  await ensureMockSlot();
  await app.listen({ port, host });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
