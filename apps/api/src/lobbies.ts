import { randomBytes } from "crypto";
import type { Lobby, LobbyMember, ServerSlot, User } from "@prisma/client";
import { FORMATS, MODES, connectString, isFormat, isMode, type ModeId } from "./catalog";
import { mockServers, prisma, pterodactylConfigured } from "./db";
import { configureAndStart, stopServer } from "./pterodactyl";

const NO_SERVER = "Нет свободного сервера";
const POOL_NOT_CONFIGURED = "Игровой пул не настроен (нет ключей панели)";

function poolUnavailableError(): Error {
  if (!mockServers() && !pterodactylConfigured()) {
    return new Error(POOL_NOT_CONFIGURED);
  }
  return new Error(NO_SERVER);
}

type LobbyWithRelations = Lobby & {
  owner: User;
  members: Array<LobbyMember & { user: User }>;
  serverSlot: ServerSlot | null;
};

export function newInviteCode(): string {
  return randomBytes(6).toString("hex");
}

export function toLobbyDto(lobby: LobbyWithRelations, viewerId?: string) {
  const isOwner = viewerId === lobby.ownerId;
  return {
    id: lobby.id,
    title: lobby.title,
    visibility: lobby.visibility,
    format: lobby.format,
    map: lobby.map,
    slots: lobby.slots,
    maxPing: lobby.maxPing,
    minHours: lobby.minHours,
    hasPassword: Boolean(lobby.password),
    status: lobby.status,
    inviteCode: lobby.inviteCode,
    owner: {
      id: lobby.owner.id,
      personaName: lobby.owner.personaName,
      avatarUrl: lobby.owner.avatarUrl,
    },
    members: lobby.members.map((member) => ({
      id: member.user.id,
      personaName: member.user.personaName,
      avatarUrl: member.user.avatarUrl,
      pingMs: member.pingMs,
      cs2Hours: member.user.cs2Hours,
    })),
    connect: connectString(lobby.connectHost, lobby.connectPort),
    error: lobby.error,
    isOwner,
    createdAt: lobby.createdAt.toISOString(),
    startedAt: lobby.startedAt?.toISOString() ?? null,
    endedAt: lobby.endedAt?.toISOString() ?? null,
  };
}

const include = {
  owner: true,
  members: { include: { user: true }, orderBy: { joinedAt: "asc" as const } },
  serverSlot: true,
};

export async function listLobbies(filters: {
  map?: string;
  format?: string;
  visibility?: string;
  viewerId?: string;
}) {
  const lobbies = await prisma.lobby.findMany({
    where: {
      status: { in: ["waiting", "starting", "live"] },
      ...(filters.map ? { map: filters.map } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.visibility
        ? { visibility: filters.visibility }
        : {
            OR: [
              { visibility: { in: ["public", "password"] } },
              ...(filters.viewerId
                ? [{ ownerId: filters.viewerId }, { members: { some: { userId: filters.viewerId } } }]
                : []),
            ],
          }),
    },
    include,
    orderBy: { createdAt: "desc" },
  });
  return lobbies
    .filter((lobby) => lobby.visibility !== "private" || lobby.ownerId === filters.viewerId || lobby.members.some((m) => m.userId === filters.viewerId))
    .map((lobby) => toLobbyDto(lobby, filters.viewerId));
}

async function claimSlot(purpose: string, mode: string | null): Promise<ServerSlot> {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.serverSlot.findFirst({
      where: { status: "free", purpose: "pool" },
      orderBy: { createdAt: "asc" },
    });
    if (!slot) throw poolUnavailableError();
    const updated = await tx.serverSlot.updateMany({
      where: { id: slot.id, status: "free" },
      data: { status: "busy", purpose, mode },
    });
    if (updated.count !== 1) throw poolUnavailableError();
    return tx.serverSlot.findUniqueOrThrow({ where: { id: slot.id } });
  });
}

async function releaseSlot(slotId: string | null | undefined) {
  if (!slotId) return;
  const slot = await prisma.serverSlot.findUnique({ where: { id: slotId } });
  if (!slot) return;
  await stopServer(slot.identifier);
  await prisma.serverSlot.update({
    where: { id: slot.id },
    data: { status: "free", purpose: "pool", mode: null },
  });
}

export async function startLobby(lobbyId: string, ownerId: string) {
  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId }, include });
  if (!lobby) throw new Error("Лобби не найдено");
  if (lobby.ownerId !== ownerId) throw new Error("Запускать матч может только создатель");
  if (lobby.status === "live" && lobby.connectHost) return toLobbyDto(lobby, ownerId);

  await prisma.lobby.update({ where: { id: lobbyId }, data: { status: "starting", error: null } });
  const format = isFormat(lobby.format) ? FORMATS[lobby.format] : FORMATS["5v5"];
  let claimedId: string | null = null;
  try {
    const slot = lobby.serverSlot && lobby.serverSlot.status === "busy" ? lobby.serverSlot : await claimSlot("lobby", null);
    if (!lobby.serverSlot) claimedId = slot.id;
    let host = slot.allocationHost;
    let port = slot.allocationPort;
    if (mockServers()) {
      host = host || "127.0.0.1";
      port = port || 27015;
    } else {
      const started = await configureAndStart(slot, {
        map: lobby.map,
        slots: lobby.slots,
        hostname: `cyberGAU ${lobby.title}`,
        password: lobby.password ?? "",
        gameMode: format.gameMode,
        gameType: format.gameType,
      });
      host = started.host;
      port = started.port;
    }
    const updated = await prisma.lobby.update({
      where: { id: lobbyId },
      data: {
        status: "live",
        serverSlotId: slot.id,
        connectHost: host,
        connectPort: port,
        startedAt: new Date(),
        error: null,
      },
      include,
    });
    return toLobbyDto(updated, ownerId);
  } catch (error) {
    if (claimedId) await releaseSlot(claimedId);
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: { status: "waiting", error: error instanceof Error ? error.message : NO_SERVER },
    });
    throw error;
  }
}

export async function stopLobby(lobbyId: string, ownerId: string) {
  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId }, include });
  if (!lobby) throw new Error("Лобби не найдено");
  if (lobby.ownerId !== ownerId) throw new Error("Остановить матч может только создатель");
  await releaseSlot(lobby.serverSlotId);
  const updated = await prisma.lobby.update({
    where: { id: lobbyId },
    data: { status: "ended", endedAt: new Date(), serverSlotId: null },
    include,
  });
  return toLobbyDto(updated, ownerId);
}

export async function listModes() {
  const slots = await prisma.serverSlot.findMany({ where: { purpose: "mode" } });
  return Object.entries(MODES).map(([id, mode]) => {
    const slot = slots.find((item) => item.mode === id);
    return {
      id,
      ...mode,
      status: slot?.status === "busy" ? "live" : "offline",
      connect: slot ? connectString(slot.allocationHost, slot.allocationPort) : null,
    };
  });
}

export async function startMode(modeId: string) {
  if (!isMode(modeId)) throw new Error("Неизвестный режим");
  const mode = MODES[modeId as ModeId];
  const existing = await prisma.serverSlot.findFirst({ where: { purpose: "mode", mode: modeId, status: "busy" } });
  if (existing?.allocationPort) {
    return {
      id: modeId,
      ...mode,
      status: "live",
      connect: connectString(existing.allocationHost, existing.allocationPort),
    };
  }
  const slot = await claimSlot("mode", modeId);
  try {
    let host = slot.allocationHost;
    let port = slot.allocationPort;
    if (mockServers()) {
      host = host || "127.0.0.1";
      port = port || 27015;
    } else {
      const started = await configureAndStart(slot, {
        map: mode.map,
        slots: mode.slots,
        hostname: `cyberGAU ${mode.title}`,
        password: "",
        gameMode: mode.gameMode,
        gameType: mode.gameType,
      });
      host = started.host;
      port = started.port;
    }
    const updated = await prisma.serverSlot.update({
      where: { id: slot.id },
      data: { allocationHost: host, allocationPort: port, status: "busy", purpose: "mode", mode: modeId },
    });
    return { id: modeId, ...mode, status: "live", connect: connectString(updated.allocationHost, updated.allocationPort) };
  } catch (error) {
    await prisma.serverSlot.update({
      where: { id: slot.id },
      data: { status: "free", purpose: "pool", mode: null },
    });
    throw error;
  }
}

export async function stopMode(modeId: string) {
  if (!isMode(modeId)) throw new Error("Неизвестный режим");
  const slot = await prisma.serverSlot.findFirst({ where: { purpose: "mode", mode: modeId } });
  if (slot) await releaseSlot(slot.id);
  const mode = MODES[modeId as ModeId];
  return { id: modeId, ...mode, status: "offline", connect: null };
}

export async function ensureMockSlot() {
  if (!mockServers()) return;
  const count = await prisma.serverSlot.count();
  if (count > 0) return;
  await prisma.serverSlot.create({
    data: {
      label: "cybergau-mock",
      identifier: "mock",
      status: "free",
      purpose: "pool",
      allocationHost: "127.0.0.1",
      allocationPort: 27015,
    },
  });
}
