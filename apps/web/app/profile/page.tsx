"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, statusLabel, type Lobby, type User } from "../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<Lobby[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.profile()
      .then((result) => {
        setUser(result.user);
        setHistory(result.history);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) {
    return (
      <section>
        <h1>Профиль</h1>
        <p className="error">{error}</p>
        <a className="btn primary" href="/backend/auth/steam">Войти через Steam</a>
      </section>
    );
  }
  if (!user) return <p className="lead">Загрузка профиля...</p>;

  return (
    <>
      <section className="hero">
        <div className="userbox">
          {user.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt="" style={{ width: 72, height: 72 }} /> : <span className="avatar" />}
          <div>
            <h1>{user.personaName}</h1>
            <p className="lead">Steam {user.steamId}{user.cs2Hours !== null ? ` · ${user.cs2Hours} ч. CS2` : ""}</p>
          </div>
        </div>
      </section>
      <h2>История лобби</h2>
      {history.length === 0 ? <p className="empty">Пока пусто.</p> : null}
      <section className="grid">
        {history.map((lobby) => (
          <Link key={lobby.id} href={`/lobbies/${lobby.id}`} className="card">
            <span className="pill">{statusLabel(lobby.status)}</span>
            <h3>{lobby.title}</h3>
            <p className="meta">{lobby.map} · {lobby.format}</p>
          </Link>
        ))}
      </section>
    </>
  );
}
