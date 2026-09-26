"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MatchRow } from "./components/MatchRow";
import { api, type Lobby } from "../lib/api";

const ACTIVE = new Set(["waiting", "starting", "live"]);

export default function MatchesPage() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [mine, setMine] = useState<Lobby[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [maps, setMaps] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [map, setMap] = useState("");
  const [format, setFormat] = useState("");
  const [visibility, setVisibility] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    if (map) query.set("map", map);
    if (format) query.set("format", format);
    if (visibility) query.set("visibility", visibility);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    api.lobbies(suffix)
      .then((result) => {
        setLobbies(result.lobbies);
        setMaps(result.maps);
        setFormats(result.formats);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [map, format, visibility]);

  useEffect(() => {
    api.me()
      .then(async (result) => {
        if (!result.user) {
          setSignedIn(false);
          setMine([]);
          return;
        }
        setSignedIn(true);
        const profile = await api.profile();
        setMine(profile.history.filter((lobby) => ACTIVE.has(lobby.status)));
      })
      .catch(() => {
        setSignedIn(false);
        setMine([]);
      });
  }, []);

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Локальная сеть</p>
          <h1>Кастомные матчи</h1>
          <p className="lead">Соберите лобби в сети cyberGAU. Свободный сервер CS2 выдаст панель, адрес для подключения появится в комнате.</p>
        </div>
        <Link className="btn primary" href="/lobbies/new">Создать лобби</Link>
      </section>
      <div className="toolbar">
        <div className="segment" role="group" aria-label="Тип лобби">
          <button type="button" className={visibility === "" ? "on" : ""} onClick={() => setVisibility("")}>Все</button>
          <button type="button" className={visibility === "public" ? "on" : ""} onClick={() => setVisibility("public")}>Публичное</button>
          <button type="button" className={visibility === "password" ? "on" : ""} onClick={() => setVisibility("password")}>Закрытое</button>
        </div>
        <select className="select" style={{ width: "auto" }} value={map} onChange={(event) => setMap(event.target.value)}>
          <option value="">Все карты</option>
          {maps.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="select" style={{ width: "auto" }} value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">Все форматы</option>
          {formats.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {signedIn ? (
        <section>
          <div className="section-head">
            <h2>Мои матчи</h2>
          </div>
          {mine.length === 0 ? <p className="empty">Сейчас вы ни в одном живом лобби.</p> : null}
          <div className="stack">
            {mine.map((lobby) => <MatchRow key={lobby.id} lobby={lobby} />)}
          </div>
        </section>
      ) : null}
      <div className="section-head">
        <h2>Открытые лобби</h2>
      </div>
      {lobbies.length === 0 ? <p className="empty">Сейчас нет открытых лобби. Создайте первое.</p> : null}
      <div className="stack">
        {lobbies.map((lobby) => <MatchRow key={lobby.id} lobby={lobby} />)}
      </div>
    </>
  );
}
