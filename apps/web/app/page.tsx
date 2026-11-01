"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MatchRow } from "./components/MatchRow";
import { api, type Lobby } from "../lib/api";

type Tab = "new" | "active" | "ended" | "mine";

export default function MatchesPage() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [history, setHistory] = useState<Lobby[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [maps, setMaps] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [map, setMap] = useState("");
  const [format, setFormat] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [showPublic, setShowPublic] = useState(true);
  const [showPrivate, setShowPrivate] = useState(true);
  const [showFriends, setShowFriends] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    if (map) query.set("map", map);
    if (format) query.set("format", format);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    api.lobbies(suffix)
      .then((result) => {
        setLobbies(result.lobbies);
        setMaps(result.maps);
        setFormats(result.formats);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [map, format]);

  useEffect(() => {
    api.me()
      .then(async (result) => {
        if (!result.user) {
          setSignedIn(false);
          setUserId(null);
          setHistory([]);
          return;
        }
        setSignedIn(true);
        setUserId(result.user.id);
        const profile = await api.profile();
        setHistory(profile.history);
      })
      .catch(() => {
        setSignedIn(false);
        setUserId(null);
        setHistory([]);
      });
  }, []);

  const pool = useMemo(() => {
    const merged = new Map<string, Lobby>();
    for (const lobby of [...lobbies, ...history]) merged.set(lobby.id, lobby);
    return Array.from(merged.values());
  }, [lobbies, history]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((lobby) => {
      if (tab === "new" && lobby.status !== "waiting") return false;
      if (tab === "active" && !["waiting", "starting", "live"].includes(lobby.status)) return false;
      if (tab === "ended" && lobby.status !== "ended") return false;
      if (tab === "mine") {
        const mine = lobby.isOwner || lobby.members.some((member) => member.id === userId);
        if (!mine) return false;
      }
      if (!showPublic && lobby.visibility === "public") return false;
      if (!showPrivate && (lobby.visibility === "private" || lobby.visibility === "password")) return false;
      if (showFriends) {
        const related = lobby.isOwner || lobby.members.some((member) => member.id === userId);
        if (!related) return false;
      }
      if (q && !`${lobby.title} ${lobby.map} ${lobby.owner.personaName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pool, tab, showPublic, showPrivate, showFriends, search, userId]);

  const counts = useMemo(() => ({
    new: pool.filter((lobby) => lobby.status === "waiting").length,
    active: pool.filter((lobby) => ["waiting", "starting", "live"].includes(lobby.status)).length,
    ended: pool.filter((lobby) => lobby.status === "ended").length,
    mine: pool.filter((lobby) => lobby.isOwner || lobby.members.some((member) => member.id === userId)).length,
  }), [pool, userId]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Кастомные матчи</p>
          <h1>Играйте на личных серверах с друзьями</h1>
          <p className="lead">Создайте лобби, пригласите друзей по коду — сервер CS2 поднимется из пула cyberGAU.</p>
        </div>
        <Link className="btn primary" href="/lobbies/new">Создать лобби +</Link>
      </section>

      <div className="toolbar">
        <div className="segment" role="tablist" aria-label="Статус матчей">
          <button type="button" className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>Новые ({counts.new})</button>
          <button type="button" className={tab === "active" ? "on" : ""} onClick={() => setTab("active")}>Активные ({counts.active})</button>
          <button type="button" className={tab === "ended" ? "on" : ""} onClick={() => setTab("ended")}>Завершённые ({counts.ended})</button>
          <button type="button" className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")} disabled={!signedIn}>Мои матчи ({counts.mine})</button>
        </div>
        <select className="select" style={{ width: "auto" }} value={map} onChange={(event) => setMap(event.target.value)}>
          <option value="">Карта: Все</option>
          {maps.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">Формат: Все</option>
          {formats.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="search" placeholder="Поиск по карте или хосту" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <div className="check-row" style={{ marginBottom: 14 }}>
        <label><input type="checkbox" checked={showPublic} onChange={(event) => setShowPublic(event.target.checked)} /> Public</label>
        <label><input type="checkbox" checked={showPrivate} onChange={(event) => setShowPrivate(event.target.checked)} /> Private</label>
        <label><input type="checkbox" checked={showFriends} onChange={(event) => setShowFriends(event.target.checked)} disabled={!signedIn} /> With friends</label>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {filtered.length === 0 ? <p className="empty">Нет матчей по текущим фильтрам.</p> : null}
      <div className="stack">
        {filtered.map((lobby, index) => <MatchRow key={lobby.id} lobby={lobby} index={index} />)}
      </div>
    </>
  );
}
