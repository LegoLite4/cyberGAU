import { env, prisma } from "./db";

const CATALOG_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";
const PRIVATE_INVENTORY = "Инвентарь Steam закрыт. Откройте его в настройках приватности Steam, иначе скинченджер не видит скины.";

const WEAR: Record<string, number> = {
  "factory new": 0.01,
  "minimal wear": 0.1,
  "field-tested": 0.25,
  "well-worn": 0.4,
  "battle-scarred": 0.6,
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

type CatalogEntry = {
  paint: number;
  defindex: number;
  classname: string;
  kind: "weapon" | "knife" | "gloves";
};

type CatalogSkin = {
  name?: string;
  paint_index?: string;
  weapon?: { id?: string; weapon_id?: number };
  category?: { id?: string };
};

let catalog: Map<string, CatalogEntry> | null = null;

function catalogKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function kindOf(entry: CatalogSkin): CatalogEntry["kind"] | null {
  const classname = entry.weapon?.id ?? "";
  const category = entry.category?.id ?? "";
  const defindex = entry.weapon?.weapon_id ?? 0;
  if (category.includes("glove") || defindex >= 5000) return "gloves";
  if (category.includes("melee") || classname.includes("knife") || classname.includes("bayonet")) return "knife";
  if (classname.startsWith("weapon_")) return "weapon";
  return null;
}

export async function loadCatalog(): Promise<Map<string, CatalogEntry>> {
  if (catalog) return catalog;
  const response = await fetch(CATALOG_URL, { headers: { "user-agent": "cyberGAU" } });
  if (!response.ok) throw new Error("Не удалось скачать справочник скинов");
  const rows = (await response.json()) as CatalogSkin[];
  const map = new Map<string, CatalogEntry>();
  for (const row of rows) {
    const kind = kindOf(row);
    const paint = Number(row.paint_index);
    const defindex = row.weapon?.weapon_id;
    const classname = row.weapon?.id;
    if (!kind || !row.name || !classname || !defindex || !Number.isFinite(paint)) continue;
    const key = catalogKey(row.name);
    if (!map.has(key)) map.set(key, { paint, defindex, classname, kind });
  }
  catalog = map;
  return map;
}

function splitMarketName(name: string): { key: string; wear: number | null } {
  const cleaned = name
    .replace(/^StatTrak™\s+/i, "")
    .replace(/^Souvenir\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^(.*)\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i);
  if (!match) return { key: catalogKey(cleaned), wear: null };
  return { key: catalogKey(match[1]), wear: WEAR[match[2].toLowerCase()] ?? null };
}

type InventoryAsset = { classid?: string; instanceid?: string; assetid?: string };
type InventoryDescription = { classid?: string; instanceid?: string; market_hash_name?: string };
type InventoryProperty = { float_value?: string };
type InventoryPage = {
  success?: number | boolean;
  assets?: InventoryAsset[];
  descriptions?: InventoryDescription[];
  asset_properties?: Array<{ assetid?: string; asset_properties?: InventoryProperty[] }>;
  more_items?: boolean;
  last_assetid?: string;
  error?: string;
};

function wearFromProperties(properties: InventoryProperty[] | undefined): number | null {
  if (!properties) return null;
  for (const property of properties) {
    const value = Number(property.float_value);
    if (Number.isFinite(value) && value > 0 && value < 1) return value;
  }
  return null;
}

async function fetchInventory(steamId: string): Promise<Array<{ name: string; wear: number | null }>> {
  const found: Array<{ name: string; wear: number | null }> = [];
  let start = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`https://steamcommunity.com/inventory/${steamId}/730/2`);
    url.searchParams.set("l", "english");
    url.searchParams.set("count", "2000");
    if (start) url.searchParams.set("start_assetid", start);
    const response = await fetch(url, { headers: { "user-agent": "cyberGAU" } });
    if (response.status === 403) throw new Error(PRIVATE_INVENTORY);
    if (!response.ok) throw new Error(PRIVATE_INVENTORY);
    const body = (await response.json()) as InventoryPage;
    if (body.success === false || body.success === 0 || body.error) throw new Error(PRIVATE_INVENTORY);
    const descriptions = new Map<string, string>();
    for (const description of body.descriptions ?? []) {
      if (!description.market_hash_name || !description.classid) continue;
      descriptions.set(`${description.classid}_${description.instanceid ?? "0"}`, description.market_hash_name);
    }
    const floats = new Map<string, number>();
    for (const entry of body.asset_properties ?? []) {
      const wear = wearFromProperties(entry.asset_properties);
      if (entry.assetid && wear !== null) floats.set(entry.assetid, wear);
    }
    for (const asset of body.assets ?? []) {
      const name = descriptions.get(`${asset.classid}_${asset.instanceid ?? "0"}`);
      if (!name) continue;
      const precise = asset.assetid ? floats.get(asset.assetid) ?? null : null;
      found.push({ name, wear: precise });
    }
    if (!body.more_items || !body.last_assetid) break;
    start = body.last_assetid;
  }
  return found;
}

function emptyItems(): SkinItems {
  return { weapons: {}, knife: null, gloves: null };
}

export async function syncSteamInventory(userId: string, steamId: string): Promise<SkinItems> {
  const index = await loadCatalog();
  const owned = await fetchInventory(steamId);
  const items = emptyItems();
  for (const entry of owned) {
    const parsed = splitMarketName(entry.name);
    const known = index.get(parsed.key);
    if (!known) continue;
    const skin: SkinItem = {
      paint: known.paint,
      wear: entry.wear ?? parsed.wear ?? 0.01,
      seed: 0,
      defindex: known.defindex,
      classname: known.classname,
    };
    if (known.kind === "gloves") {
      if (!items.gloves || skin.wear < items.gloves.wear) items.gloves = skin;
      continue;
    }
    if (known.kind === "knife") {
      if (!items.knife || skin.wear < items.knife.wear) items.knife = skin;
      continue;
    }
    const current = items.weapons[known.classname];
    if (!current || skin.wear < current.wear) items.weapons[known.classname] = skin;
  }
  const count = Object.keys(items.weapons).length + (items.knife ? 1 : 0) + (items.gloves ? 1 : 0);
  const error = count === 0 ? "В инвентаре Steam нет скинов оружия, ножа или перчаток." : null;
  await prisma.skinLoadout.upsert({
    where: { userId },
    update: { steamId, items, error, syncedAt: new Date() },
    create: { userId, steamId, items, error },
  });
  return items;
}

export async function loadoutForSteam(steamId: string): Promise<SkinItems> {
  const row = await prisma.skinLoadout.findUnique({ where: { steamId } });
  if (!row || !row.items || typeof row.items !== "object" || Array.isArray(row.items)) return emptyItems();
  const items = row.items as Partial<SkinItems>;
  return {
    weapons: items.weapons ?? {},
    knife: items.knife ?? null,
    gloves: items.gloves ?? null,
  };
}

export function pluginZipPath(): string {
  return env("SKINCHANGER_ZIP", "/skinchanger/CybergauSkins.zip");
}
