"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, statusLabel, visibilityLabel, type Lobby } from "../lib/api";

export default function MatchesPage() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
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

  return (
    <>
      <section className="hero">
        <div>
          <h1>Свои матчи в локальной сети</h1>
          <p className="lead">Соберите лобби, выберите карту и формат. cyberGAU займёт свободный сервер CS2 в Pterodactyl и отдаст адрес для подключения.</p>
        </div>
        <Link className="btn primary" href="/lobbies/new">Создать лобби</Link>
      </section>
      <div className="filters" style={{ marginBottom: 16 }}>
        <select className="select" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="">Все типы</option>
          <option value="public">Открытые</option>
          <option value="password">С паролем</option>
        </select>
        <select className="select" value={map} onChange={(event) => setMap(event.target.value)}>
          <option value="">Все карты</option>
          {maps.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select className="select" value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="">Все форматы</option>
          {formats.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {lobbies.length === 0 ? <p className="empty">Сейчас нет открытых лобби. Создайте первое.</p> : null}
      <section className="grid">
        {lobbies.map((lobby) => (
          <Link key={lobby.id} href={`/lobbies/${lobby.id}`} className="card">
            <div className="meta">
              <span className="pill">{visibilityLabel(lobby.visibility)}</span>
              <span className={lobby.status === "live" ? "pill live" : "pill"}>{statusLabel(lobby.status)}</span>
            </div>
            <h3>{lobby.title}</h3>
            <p className="meta">{lobby.map} · {lobby.format} · {lobby.members.length}/{lobby.slots}</p>
            <p className="meta">Хост {lobby.owner.personaName}</p>
          </Link>
        ))}
      </section>
    </>
  );
}
