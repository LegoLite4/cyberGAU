import { prisma } from "./db";

const MISSION_DEFS = [
  { id: "play_1", title: "Сыграть матч", description: "Запустите лобби или режим и зайдите на сервер.", target: 1 },
  { id: "create_lobby", title: "Создать лобби", description: "Создайте кастомное лобби.", target: 1 },
  { id: "save_skins", title: "Собрать скины", description: "Сохраните набор скинов.", target: 1 },
  { id: "invite_friend", title: "Пригласить друга", description: "Поделитесь кодом приглашения.", target: 1 },
  { id: "try_mode", title: "Попробовать режим", description: "Запустите DM или Duels.", target: 1 },
] as const;

const PICKEM_MATCHES = [
  { id: "m1", title: "LAN Finals", sideA: "Alpha", sideB: "Bravo" },
  { id: "m2", title: "Dust2 Showdown", sideA: "Mirage FC", sideB: "Nuke United" },
  { id: "m3", title: "Retake Cup", sideA: "CT Crew", sideB: "T Force" },
] as const;

type MissionState = Record<string, { progress: number; claimed?: boolean }>;
type PickemVotes = Record<string, "a" | "b">;

function asMissionState(value: unknown): MissionState {
  if (!value || typeof value !== "object") return {};
  return value as MissionState;
}

function asPickemVotes(value: unknown): PickemVotes {
  if (!value || typeof value !== "object") return {};
  return value as PickemVotes;
}

export async function getLeaderboard(period: string, mode: string) {
  const since = period === "month"
    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    : new Date(0);

  const lobbies = await prisma.lobby.findMany({
    where: {
      status: "ended",
      endedAt: { gte: since },
      ...(mode && mode !== "all" ? { format: mode } : {}),
    },
    include: {
      owner: true,
      members: { include: { user: true } },
    },
    take: 200,
    orderBy: { endedAt: "desc" },
  });

  const stats = new Map<string, {
    personaName: string;
    avatarUrl: string | null;
    kills: number;
    hours: number;
    games: number;
  }>();

  for (const lobby of lobbies) {
    const people = [
      lobby.owner,
      ...lobby.members.map((member) => member.user),
    ];
    for (const user of people) {
      const row = stats.get(user.id) || {
        personaName: user.personaName,
        avatarUrl: user.avatarUrl,
        kills: 0,
        hours: user.cs2Hours || 0,
        games: 0,
      };
      row.games += 1;
      row.kills += 8 + (user.personaName.length % 7);
      stats.set(user.id, row);
    }
  }

  let rows = Array.from(stats.values()).map((row) => ({
    personaName: row.personaName,
    avatarUrl: row.avatarUrl,
    kills: row.kills,
    hsPercent: 35 + (row.personaName.length % 40),
    kd: Number((0.8 + (row.games % 10) / 10).toFixed(2)),
    hours: row.hours,
    points: row.kills * 3 + row.games * 10,
  }));

  if (rows.length < 5) {
    const seed = [
      { personaName: "cyberGAU Rookie", avatarUrl: null, kills: 120, hsPercent: 48, kd: 1.2, hours: 12, points: 420 },
      { personaName: "LAN Legend", avatarUrl: null, kills: 96, hsPercent: 52, kd: 1.1, hours: 9, points: 360 },
      { personaName: "Dust Walker", avatarUrl: null, kills: 80, hsPercent: 41, kd: 0.95, hours: 7, points: 290 },
      { personaName: "Mirage Fox", avatarUrl: null, kills: 64, hsPercent: 44, kd: 0.9, hours: 5, points: 240 },
      { personaName: "Newbie", avatarUrl: null, kills: 40, hsPercent: 33, kd: 0.7, hours: 2, points: 150 },
    ];
    rows = [...rows, ...seed].slice(0, 12);
  }

  rows.sort((a, b) => b.points - a.points);
  return {
    mode: mode || "all",
    period: period || "month",
    rows: rows.map((row, index) => ({ position: index + 1, ...row })),
  };
}

export async function listMissions(userId: string | null) {
  let state: MissionState = {};
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    state = asMissionState(user?.missionState);
  }

  // Soft progress from activity if empty
  if (userId && Object.keys(state).length === 0) {
    const owned = await prisma.lobby.count({ where: { ownerId: userId } });
    const memberships = await prisma.lobbyMember.count({ where: { userId } });
    const skins = await prisma.skinLoadout.count({ where: { userId } });
    state = {
      play_1: { progress: memberships + owned > 0 ? 1 : 0 },
      create_lobby: { progress: Math.min(1, owned) },
      save_skins: { progress: Math.min(1, skins) },
      invite_friend: { progress: 0 },
      try_mode: { progress: 0 },
    };
  }

  const missions = MISSION_DEFS.map((def) => {
    const progress = Math.min(def.target, state[def.id]?.progress ?? 0);
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      progress,
      target: def.target,
      done: progress >= def.target || Boolean(state[def.id]?.claimed),
    };
  });

  return {
    missions,
    completed: missions.filter((mission) => mission.done).length,
    total: missions.length,
  };
}

export async function claimMission(userId: string, missionId: string) {
  const def = MISSION_DEFS.find((item) => item.id === missionId);
  if (!def) throw new Error("Миссия не найдена");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const state = asMissionState(user.missionState);
  const current = state[missionId] || { progress: 0 };
  if (current.progress < def.target) {
    current.progress = def.target;
  }
  current.claimed = true;
  state[missionId] = current;
  await prisma.user.update({
    where: { id: userId },
    data: { missionState: state as object },
  });
  return listMissions(userId);
}

export async function listPickem(userId: string | null) {
  let votes: PickemVotes = {};
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    votes = asPickemVotes(user?.pickemVotes);
  }
  return {
    matches: PICKEM_MATCHES.map((match) => ({
      ...match,
      vote: votes[match.id] ?? null,
    })),
  };
}

export async function votePickem(userId: string, matchId: string, side: "a" | "b") {
  if (!PICKEM_MATCHES.some((match) => match.id === matchId)) throw new Error("Матч не найден");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const votes = asPickemVotes(user.pickemVotes);
  votes[matchId] = side;
  await prisma.user.update({
    where: { id: userId },
    data: { pickemVotes: votes as object },
  });
  return listPickem(userId);
}
