"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MatchRow } from "../components/MatchRow";
import { api, type Lobby, type User } from "../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<Lobby[]>([]);
  const [tab, setTab] = useState("profile");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) setNotice(params.get("error") || "");
    if (params.get("steam") === "linked") setNotice("Steam привязан. Обновите скины, чтобы скинченджер их увидел.");
    const nextTab = params.get("tab");
    if (nextTab) setTab(nextTab);
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
  if (!user) return <p className="lead">Загрузка профиля…</p>;

  const noticeOk = notice.startsWith("Steam привязан") || notice.startsWith("Скинов");

  return (
    <>
      <div className="profile-banner">
        <div className="row" style={{ gap: 14 }}>
          {user.avatarUrl ? <img className="avatar lg" src={user.avatarUrl} alt="" /> : <span className="avatar lg" />}
          <div>
            <h1 style={{ fontSize: 28 }}>{user.personaName}</h1>
            <p className="meta">
              Логин {user.username || "не задан"}
              {user.cs2Hours !== null ? ` · ${user.cs2Hours} ч. CS2` : ""}
              {" · бесплатный аккаунт"}
            </p>
          </div>
        </div>
        <Link className="btn primary" href="/skins">Выбрать скины</Link>
      </div>

      <div className="tabs">
        <button type="button" className={tab === "profile" ? "on" : ""} onClick={() => setTab("profile")}>Профиль</button>
        <button type="button" className={tab === "friends" ? "on" : ""} onClick={() => setTab("friends")}>Друзья</button>
        <Link href="/skins">Инвентарь / Скины</Link>
        <button type="button" className={tab === "achievements" ? "on" : ""} onClick={() => setTab("achievements")}>Достижения</button>
        <button type="button" className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Настройки</button>
      </div>

      {notice ? <p className={noticeOk ? "ok" : "toast"}>{notice}</p> : null}

      {tab === "friends" ? (
        <section className="card">
          <h2>Друзья</h2>
          <p className="lead">Список друзей появится позже. Пока зовите по коду приглашения из лобби — без Premium.</p>
          <Link className="btn primary" href="/">К матчам</Link>
        </section>
      ) : null}

      {tab === "achievements" ? (
        <section className="card">
          <h2>Достижения</h2>
          <p className="lead">Косметические бейджи за миссии и матчи. Откройте раздел миссий.</p>
          <Link className="btn primary" href="/missions">Миссии</Link>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="card stack">
          <h2>Настройки</h2>
          <p className="meta">Язык: Русский · Тема: cyberGAU green</p>
          <p className="lead">Оплата и Premium не используются. Все функции сайта бесплатны.</p>
        </section>
      ) : null}

      {tab === "profile" ? (
        <>
          <section className="panel" style={{ marginBottom: 22 }}>
            <h2>Steam и скины</h2>
            <p className="lead">Steam нужен, чтобы сервер узнал вас в игре. Выбор скинов полностью бесплатный.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn primary" href="/skins">Открыть выбор скинов</Link>
            </div>
            {user.steamId ? (
              <div className="stack" style={{ marginTop: 12 }}>
                <p className="meta">Привязан Steam {user.steamId}{user.skins.syncedAt ? ` · скины обновлены ${new Date(user.skins.syncedAt).toLocaleString("ru-RU")}` : ""}</p>
                <p className="meta">В наборе: {user.skins.count}</p>
                {user.skins.error ? <p className="error">{user.skins.error}</p> : null}
                <button className="btn" onClick={refreshSkins} disabled={pending}>{pending ? "Читаем инвентарь…" : "Подставить из инвентаря Steam"}</button>
              </div>
            ) : (
              <a className="btn primary" href="/backend/auth/steam" style={{ display: "inline-block", marginTop: 12 }}>Привязать Steam</a>
            )}
          </section>
          <div className="section-head"><h2>История матчей</h2></div>
          {history.length === 0 ? <p className="empty">Пока нет матчей.</p> : null}
          <div className="stack">
            {history.map((lobby, index) => <MatchRow key={lobby.id} lobby={lobby} index={index} />)}
          </div>
        </>
      ) : null}
    </>
  );
}
