"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type CatalogWeapon, type SkinItem, type SkinItems, type User } from "../../lib/api";

const WEARS = [
  { value: 0.01, label: "FN" },
  { value: 0.1, label: "MW" },
  { value: 0.25, label: "FT" },
  { value: 0.4, label: "WW" },
  { value: 0.6, label: "BS" },
];

const COLLECTIONS: Array<{ id: string; title: string; groups?: string[] }> = [
  { id: "main", title: "Основная коллекция" },
  { id: "rifles", title: "Винтовки", groups: ["Винтовки"] },
  { id: "pistols", title: "Пистолеты", groups: ["Пистолеты"] },
  { id: "smg", title: "Пистолеты-пулемёты", groups: ["Пистолеты-пулемёты"] },
  { id: "heavy", title: "Тяжёлое", groups: ["Тяжёлое", "Дробовики", "Пулемёты"] },
  { id: "knives", title: "Ножи", groups: ["Ножи"] },
  { id: "gloves", title: "Перчатки", groups: ["Перчатки"] },
];

function emptyItems(): SkinItems {
  return { weapons: {}, knife: null, gloves: null };
}

function currentSlot(weapon: CatalogWeapon, items: SkinItems): SkinItem | null {
  if (weapon.kind === "knife") return items.knife?.classname === weapon.classname ? items.knife : null;
  if (weapon.kind === "gloves") return items.gloves?.classname === weapon.classname ? items.gloves : null;
  return items.weapons[weapon.classname] ?? null;
}

function hasChoice(weapon: CatalogWeapon, items: SkinItems): boolean {
  if (weapon.kind === "knife") return items.knife?.classname === weapon.classname;
  if (weapon.kind === "gloves") return items.gloves?.classname === weapon.classname;
  return Boolean(items.weapons[weapon.classname]);
}

export default function SkinsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [weapons, setWeapons] = useState<CatalogWeapon[]>([]);
  const [collectionId, setCollectionId] = useState("main");
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<SkinItems>(emptyItems);
  const [wear, setWear] = useState(0.01);
  const [query, setQuery] = useState("");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.me()
      .then(async (result) => {
        setUser(result.user);
        if (!result.user) return;
        const [catalog, mine] = await Promise.all([api.skinCatalog(), api.mySkins()]);
        setWeapons(catalog.weapons);
        setItems(mine.items);
        const first = catalog.weapons.find((weapon) => weapon.classname === "weapon_ak47") ?? catalog.weapons[0];
        if (first) setSelectedId(first.classname);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setReady(true));
  }, []);

  const collection = COLLECTIONS.find((item) => item.id === collectionId) ?? COLLECTIONS[0];
  const filteredWeapons = useMemo(() => {
    if (!collection.groups?.length) return weapons;
    const allowed = new Set(collection.groups.map((name) => name.toLowerCase()));
    return weapons.filter((weapon) => allowed.has(weapon.group.toLowerCase()) || [...allowed].some((name) => weapon.group.toLowerCase().includes(name)));
  }, [weapons, collection]);

  const groups = useMemo(() => {
    const rows: Array<{ name: string; weapons: CatalogWeapon[] }> = [];
    for (const weapon of filteredWeapons) {
      const last = rows[rows.length - 1];
      if (!last || last.name !== weapon.group) rows.push({ name: weapon.group, weapons: [weapon] });
      else last.weapons.push(weapon);
    }
    return rows;
  }, [filteredWeapons]);

  useEffect(() => {
    if (!filteredWeapons.some((weapon) => weapon.classname === selectedId)) {
      setSelectedId(filteredWeapons[0]?.classname || "");
    }
  }, [filteredWeapons, selectedId]);

  const selected = weapons.find((weapon) => weapon.classname === selectedId) ?? null;
  const visibleSkins = useMemo(() => {
    if (!selected) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return selected.skins;
    return selected.skins.filter((skin) => skin.name.toLowerCase().includes(needle));
  }, [selected, query]);

  const selectedCount = useMemo(() => {
    return Object.keys(items.weapons).length + (items.knife ? 1 : 0) + (items.gloves ? 1 : 0);
  }, [items]);

  function writeSlot(weapon: CatalogWeapon, skin: SkinItem | null) {
    setItems((current) => {
      if (weapon.kind === "knife") return { ...current, knife: skin };
      if (weapon.kind === "gloves") return { ...current, gloves: skin };
      const weaponsNext = { ...current.weapons };
      if (skin) weaponsNext[weapon.classname] = skin;
      else delete weaponsNext[weapon.classname];
      return { ...current, weapons: weaponsNext };
    });
    setNotice("");
  }

  function chooseSkin(paint: number) {
    if (!selected) return;
    const previous = currentSlot(selected, items);
    writeSlot(selected, {
      paint,
      wear: previous?.wear ?? wear,
      seed: previous?.seed ?? 0,
      defindex: 0,
      classname: selected.classname,
    });
  }

  function chooseWear(next: number) {
    setWear(next);
    if (!selected) return;
    const previous = currentSlot(selected, items);
    if (!previous) return;
    writeSlot(selected, { ...previous, wear: next });
  }

  async function save() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api.saveSkins(items);
      setNotice(demo
        ? "Сохранено. Демо-режим включён: набор всё равно бесплатно записан на аккаунт."
        : "Скины записаны. На сервере появятся при следующем заходе; !skins обновляет сразу.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Набор не сохранён");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <p className="lead">Загрузка скинов…</p>;
  if (!user) {
    return (
      <section className="panel empty-board">
        <h1>Выбрать скины</h1>
        <p className="lead">Сначала войдите в аккаунт cyberGAU — выбор скинов полностью бесплатный.</p>
        <Link className="btn primary" href="/login">Войти</Link>
      </section>
    );
  }

  const chosen = selected ? currentSlot(selected, items) : null;

  return (
    <>
      <div className="profile-banner">
        <div className="row" style={{ gap: 14 }}>
          {user.avatarUrl ? <img className="avatar lg" src={user.avatarUrl} alt="" /> : <span className="avatar lg" />}
          <div>
            <h1 style={{ fontSize: 28 }}>{user.personaName}</h1>
            <p className="meta">{selectedCount} скинов в наборе · бесплатно</p>
          </div>
        </div>
        <Link className="btn" href="/profile">Профиль</Link>
      </div>

      <div className="tabs">
        <Link href="/profile">Профиль</Link>
        <Link href="/profile?tab=friends">Друзья</Link>
        <Link href="/skins" className="on">Выбор скинов</Link>
        <Link href="/profile?tab=settings">Настройки</Link>
      </div>

      {user.steamId ? null : (
        <p className="error">Привяжите Steam для скинченджера на сервере. <a href="/backend/auth/steam">Привязать Steam</a></p>
      )}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}

      <div className="skin-layout">
        <aside className="skin-side">
          <button type="button" className="collection-btn" onClick={() => setNotice("Слоты коллекций: используйте пресеты слева. Всё бесплатно, без Premium.")}>
            <span>+ Создать коллекцию</span>
            <span className="meta">14/20</span>
          </button>
          <div className="group-label">Коллекции</div>
          {COLLECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={collectionId === item.id ? "collection-btn on" : "collection-btn"}
              onClick={() => setCollectionId(item.id)}
            >
              <span>{item.title}</span>
            </button>
          ))}
          <div className="group-label">Оружие</div>
          {groups.map((group) => (
            <div key={group.name}>
              <div className="group-label">{group.name}</div>
              {group.weapons.map((weapon) => (
                <button
                  key={weapon.classname}
                  type="button"
                  className={weapon.classname === selectedId ? "weapon-btn on" : "weapon-btn"}
                  onClick={() => { setSelectedId(weapon.classname); setQuery(""); }}
                >
                  <span>{weapon.name}</span>
                  {hasChoice(weapon, items) ? <span className="dot" /> : null}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="skin-main stack">
          <div className="section-head">
            <div>
              <h2>{collection.title}</h2>
              <p className="meta">{selected ? selected.name : "Скины не выбраны"}</p>
            </div>
            <label className="row" style={{ color: "var(--muted)", fontSize: 14 }}>
              <input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} />
              Бесплатный демо-режим
            </label>
          </div>
          <div className="toolbar">
            <input className="field" style={{ maxWidth: 280 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск скина" />
            <div className="segment" role="group" aria-label="Износ">
              {WEARS.map((item) => {
                const activeWear = chosen?.wear ?? wear;
                return (
                  <button key={item.value} type="button" className={activeWear === item.value ? "on" : ""} onClick={() => chooseWear(item.value)}>
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button className="btn" type="button" disabled={!selected || !chosen} onClick={() => selected && writeSlot(selected, null)}>Сбросить</button>
            <button className="btn primary" disabled={pending || !user.steamId} onClick={save}>
              {pending ? "Сохраняем…" : "Сохранить набор"}
            </button>
          </div>
          {!selected ? <p className="empty">Скины не выбраны</p> : null}
          <div className="skin-grid">
            {visibleSkins.map((skin) => {
              const active = chosen?.paint === skin.paint;
              return (
                <button key={skin.paint} type="button" className={active ? "skin-card on" : "skin-card"} onClick={() => chooseSkin(skin.paint)}>
                  {skin.image ? <img src={skin.image} alt="" /> : <span className="map-chip">{selected?.name}</span>}
                  <span>{skin.name}</span>
                </button>
              );
            })}
          </div>
          {selected && visibleSkins.length === 0 ? <p className="empty">Ничего не найдено.</p> : null}
        </section>
      </div>
    </>
  );
}
