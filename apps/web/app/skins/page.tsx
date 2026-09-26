"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type CatalogWeapon, type SkinItem, type SkinItems, type User } from "../../lib/api";

const WEARS = [
  { value: 0.01, label: "Прямо с завода" },
  { value: 0.1, label: "Немного поношенное" },
  { value: 0.25, label: "После полевых" },
  { value: 0.4, label: "Поношенное" },
  { value: 0.6, label: "Закалённое в боях" },
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
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState<SkinItems>(emptyItems);
  const [wear, setWear] = useState(0.01);
  const [query, setQuery] = useState("");
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

  const selected = weapons.find((weapon) => weapon.classname === selectedId) ?? null;
  const groups = useMemo(() => {
    const rows: Array<{ name: string; weapons: CatalogWeapon[] }> = [];
    for (const weapon of weapons) {
      const last = rows[rows.length - 1];
      if (!last || last.name !== weapon.group) rows.push({ name: weapon.group, weapons: [weapon] });
      else last.weapons.push(weapon);
    }
    return rows;
  }, [weapons]);

  const visibleSkins = useMemo(() => {
    if (!selected) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return selected.skins;
    return selected.skins.filter((skin) => skin.name.toLowerCase().includes(needle));
  }, [selected, query]);

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
      setNotice("Скины записаны на аккаунт. Они появятся при следующем появлении на сервере. Команда !skins обновляет их сразу.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Набор не сохранён");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <p className="lead">Загрузка скинов...</p>;
  if (!user) {
    return (
      <section className="panel empty-board">
        <h1>Выбрать скины</h1>
        <p className="lead">Сначала войдите в аккаунт cyberGAU.</p>
        <Link className="btn primary" href="/login">Войти</Link>
      </section>
    );
  }

  const chosen = selected ? currentSlot(selected, items) : null;

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Скинченджер</p>
          <h1>Выбрать скины</h1>
          <p className="lead">Выберите любой скин из справочника и подтвердите набор. На сервере cyberGAU он надевается на ваш Steam.</p>
        </div>
        <button className="btn primary" disabled={pending || !user.steamId} onClick={save}>
          {pending ? "Сохраняем..." : "Сохранить"}
        </button>
      </section>
      {user.steamId ? null : (
        <p className="error">Сначала привяжите Steam — это нужно для скинченджера. <a href="/backend/auth/steam">Привязать Steam — нужно для скинченджера</a></p>
      )}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}
      <div className="skin-layout">
        <aside className="panel skin-weapons">
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
        <section className="stack">
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
          </div>
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
          {visibleSkins.length === 0 ? <p className="empty">Ничего не найдено.</p> : null}
        </section>
      </div>
    </>
  );
}
