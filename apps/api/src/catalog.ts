export const MAPS = [
  "de_dust2",
  "de_mirage",
  "de_inferno",
  "de_nuke",
  "de_ancient",
  "de_anubis",
  "de_overpass",
  "de_train",
  "de_vertigo",
] as const;

export const FORMATS = {
  "1v1": { slots: 2, gameMode: "1", gameType: "0", label: "1v1" },
  "2v2": { slots: 4, gameMode: "2", gameType: "0", label: "2v2" },
  "5v5": { slots: 10, gameMode: "1", gameType: "0", label: "5v5" },
  casual: { slots: 12, gameMode: "0", gameType: "0", label: "Свободная" },
} as const;

export type FormatId = keyof typeof FORMATS;

export const MODES = {
  dm: {
    title: "Deathmatch",
    summary: "Свободная перестрелка на классической карте.",
    map: "de_dust2",
    slots: 16,
    gameMode: "2",
    gameType: "1",
  },
  retake: {
    title: "Retake",
    summary: "Ретейк сайта после выхода. На сервере нужен свой конфиг режима.",
    map: "de_mirage",
    slots: 10,
    gameMode: "0",
    gameType: "3",
  },
  duels: {
    title: "Duels",
    summary: "Дуэль 1 на 1.",
    map: "de_mirage",
    slots: 2,
    gameMode: "1",
    gameType: "0",
  },
  wingman: {
    title: "Wingman",
    summary: "Формат 2 на 2.",
    map: "de_inferno",
    slots: 4,
    gameMode: "2",
    gameType: "0",
  },
  competitive: {
    title: "Competitive",
    summary: "Классический матч 5 на 5.",
    map: "de_dust2",
    slots: 10,
    gameMode: "1",
    gameType: "0",
  },
} as const;

export type ModeId = keyof typeof MODES;

/** UI-only modes (Cybershoke-like chips/cards). Not startable on this node yet. */
export const COMING_SOON_MODES = [
  { id: "arena", title: "Arena", summary: "Арена 1v1/2v2 — скоро на этой ноде.", chip: "Arena" },
  { id: "knife", title: "Knife", summary: "Ножевые раунды — скоро.", chip: "Knife" },
  { id: "awp", title: "AWP", summary: "Только AWP — скоро.", chip: "AWP" },
  { id: "bhop", title: "Bhop", summary: "Банихоп — скоро.", chip: "Bhop" },
  { id: "surf", title: "Surf", summary: "Сёрф — скоро.", chip: "Surf" },
  { id: "kz", title: "KZ", summary: "Climb — скоро.", chip: "KZ" },
  { id: "public", title: "Public", summary: "Паблик — скоро.", chip: "Public" },
  { id: "hsdm", title: "HSDM", summary: "Headshot DM — скоро.", chip: "HSDM" },
  { id: "aimdm", title: "AimDM", summary: "Aim arena — скоро.", chip: "AimDM" },
  { id: "jail", title: "Jail", summary: "Jailbreak — скоро.", chip: "Jail" },
  { id: "hns", title: "HNS", summary: "Hide and Seek — скоро.", chip: "HNS" },
  { id: "execute", title: "Execute", summary: "Execute practice — скоро.", chip: "Execute" },
  { id: "clutch", title: "Clutch", summary: "Clutch training — скоро.", chip: "Clutch" },
  { id: "pistoldm", title: "PistolDM", summary: "Пистолетный DM — скоро.", chip: "PistolDM" },
  { id: "awpdm", title: "AWPDM", summary: "AWP DM — скоро.", chip: "AWPDM" },
  { id: "retake_cards", title: "Retake Cards", summary: "Ретейк с картами — скоро.", chip: "Retake Cards" },
  { id: "multicfg", title: "MultiCFG", summary: "Несколько конфигов — скоро.", chip: "MultiCFG" },
  { id: "maniac", title: "Maniac", summary: "Maniac — скоро.", chip: "Maniac" },
  { id: "deathrun", title: "Deathrun", summary: "Deathrun — скоро.", chip: "Deathrun" },
  { id: "minigames", title: "Minigames", summary: "Мини-игры — скоро.", chip: "Minigames" },
  { id: "surf_combat", title: "Surf Combat", summary: "Surf combat — скоро.", chip: "Surf Combat" },
  { id: "skin_inspect", title: "Skin Inspect", summary: "Осмотр скинов — скоро.", chip: "Skin Inspect" },
] as const;

export function isFormat(value: string): value is FormatId {
  return value in FORMATS;
}

export function isMode(value: string): value is ModeId {
  return value in MODES;
}

export function connectString(host: string | null | undefined, port: number | null | undefined): string | null {
  if (!host || !port) return null;
  return `${host}:${port}`;
}
