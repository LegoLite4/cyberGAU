"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, statusLabel, type Lobby, type User } from "../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<Lobby[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) setNotice(params.get("error") || "");
    if (params.get("steam") === "linked") setNotice("Steam привязан. Обновите скины, чтобы скинченджер их увидел.");
    api.profile()
      .then((result) => {
        setUser(result.user);
        setHistory(result.history);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function refreshSkins() {
    setPending(true);
    setNotice("");
    try {
      const result = await api.syncSkins();
      setUser(result.user);
      setNotice(result.user.skins.error || `Скинов в наборе: ${result.user.skins.count}`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Скины не обновлены");
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return (
      <section>
        <h1>Профиль</h1>
        <p className="error">{error}</p>
        <Link className="btn primary" href="/login">Войти</Link>
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
            <p className="lead">Логин {user.username || "не задан"}{user.cs2Hours !== null ? ` · ${user.cs2Hours} ч. CS2` : ""}</p>
          </div>
        </div>
      </section>
      <section className="panel" style={{ marginBottom: 22 }}>
        <h2>Steam для скинченджера</h2>
        <p className="lead">Игра и лобби работают с логином cyberGAU. Steam нужен только чтобы подставить ваши настоящие скины на сервере. В чате игры логина нет.</p>
        {user.steamId ? (
          <>
            <p className="meta">Привязан Steam {user.steamId}{user.skins.syncedAt ? ` · скины обновлены ${new Date(user.skins.syncedAt).toLocaleString("ru-RU")}` : ""}</p>
            <p className="meta">В наборе: {user.skins.count}</p>
            {user.skins.error ? <p className="error">{user.skins.error}</p> : null}
            <button className="btn primary" onClick={refreshSkins} disabled={pending}>{pending ? "Читаем инвентарь..." : "Обновить скины"}</button>
          </>
        ) : (
          <a className="btn primary" href="/backend/auth/steam">Привязать Steam — нужно для скинченджера</a>
        )}
        {notice ? <p className={notice.startsWith("Steam привязан") || notice.startsWith("Скинов") ? "ok" : "error"}>{notice}</p> : null}
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
