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
