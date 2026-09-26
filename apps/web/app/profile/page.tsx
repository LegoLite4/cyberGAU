"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MatchRow } from "../components/MatchRow";
import { api, type Lobby, type User } from "../../lib/api";

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
      <section className="panel empty-board">
        <h1>Профиль</h1>
        <p className="error">{error}</p>
        <Link className="btn primary" href="/login">Войти</Link>
      </section>
    );
  }
  if (!user) return <p className="lead">Загрузка профиля...</p>;

  const noticeOk = notice.startsWith("Steam привязан") || notice.startsWith("Скинов");

  return (
    <>
      <section className="hero">
        <div className="userbox">
          {user.avatarUrl ? <img className="avatar lg" src={user.avatarUrl} alt="" /> : <span className="avatar lg" />}
          <div>
            <p className="kicker">Профиль</p>
            <h1>{user.personaName}</h1>
            <p className="lead">Логин {user.username || "не задан"}{user.cs2Hours !== null ? ` · ${user.cs2Hours} ч. CS2` : ""}</p>
          </div>
        </div>
      </section>
      <section className="panel" id="skins" style={{ marginBottom: 22, padding: 18 }}>
        <h2>Выбрать скины</h2>
        <p className="lead">Любой скин из справочника CS2 сохраняется на аккаунт и надевается на сервере cyberGAU. Steam нужен, чтобы сервер узнал вас в игре.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn primary" href="/skins">Открыть выбор скинов</Link>
        </div>
        {user.steamId ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="meta">Привязан Steam {user.steamId}{user.skins.syncedAt ? ` · скины обновлены ${new Date(user.skins.syncedAt).toLocaleString("ru-RU")}` : ""}</p>
            <p className="meta">В наборе: {user.skins.count}</p>
            {user.skins.error ? <p className="error">{user.skins.error}</p> : null}
            <button className="btn" onClick={refreshSkins} disabled={pending}>{pending ? "Читаем инвентарь..." : "Подставить из инвентаря Steam"}</button>
          </div>
        ) : (
          <a className="btn primary" href="/backend/auth/steam" style={{ display: "inline-block", marginTop: 12 }}>Привязать Steam — нужно для скинченджера</a>
        )}
        {notice ? <p className={noticeOk ? "ok" : "error"}>{notice}</p> : null}
      </section>
      <h2>История лобби</h2>
      {history.length === 0 ? <p className="empty">Пока пусто.</p> : null}
      <div className="stack">
        {history.map((lobby) => <MatchRow key={lobby.id} lobby={lobby} />)}
      </div>
    </>
  );
}
