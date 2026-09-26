"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { api, statusLabel, type ModeCard } from "../../lib/api";

const LIVE_ORDER = [
  { id: "dm", title: "Deathmatch" },
  { id: "duels", title: "Duels" },
  { id: "retake", title: "Retake" },
  { id: "competitive", title: "Competitive" },
  { id: "wingman", title: "Wingman" },
] as const;

const UNAVAILABLE = [
  "Retake Cards",
  "Bhop",
  "Surf",
  "KZ",
  "Public",
  "AWP",
  "Duels 2x2",
  "Execute",
  "Clutch",
  "Pistol Retake",
  "Arena",
  "Multicfg",
  "Pistol DM",
  "HSDM",
  "AWPDM",
  "AIMDM",
  "Jail",
  "Maniac",
  "Deathrun",
  "Minigames",
  "HNS",
  "Surf Combat",
  "Skin Inspect",
];

export default function ModesPage() {
  const [modes, setModes] = useState<ModeCard[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  function load() {
    api.modes()
      .then((result) => {
        setModes(result.modes);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setReady(true));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(mode: ModeCard) {
    setPending(mode.id);
    setError("");
    try {
      if (mode.status === "live") await api.stopMode(mode.id);
      else await api.startMode(mode.id);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось переключить режим");
    } finally {
      setPending("");
    }
  }

  const byId = new Map(modes.map((mode) => [mode.id, mode]));

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Серверы сети</p>
          <h1>Режимы</h1>
          <p className="lead">Постоянные режимы занимают свободный слот Pterodactyl. Запустить можно только то, что стоит в этой сети.</p>
        </div>
        <Link className="btn primary" href="/lobbies/new">Создать лобби</Link>
      </section>
      {error ? <p className="error">{error}</p> : null}
      <section className="mode-grid">
        <Link href="/" className="mode-tile">
          <span className="pill">Лобби</span>
          <h3>Матчи</h3>
          <p className="meta">Свои сервера с друзьями</p>
          <span className="btn">Открыть</span>
        </Link>
        {LIVE_ORDER.map((item) => {
          const mode = byId.get(item.id);
          if (!mode) {
            return (
              <motion.article
                key={item.id}
                className="mode-tile"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.22 }}
              >
                <span className="pill">{ready ? "Нет данных" : "Загрузка"}</span>
                <h3>{item.title}</h3>
                <p className="meta">{ready ? "Сервер режимов не ответил" : "Читаем слот в сети"}</p>
                <button className="btn primary" disabled>Играть</button>
              </motion.article>
            );
          }
          const live = mode.status === "live";
          return (
            <motion.article
              key={mode.id}
              className="mode-tile"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22 }}
            >
              <div className="meta">
                <span className={live ? "pill live" : "pill"}>{statusLabel(mode.status)}</span>
                <span>{mode.map}</span>
              </div>
              <h3>{mode.title}</h3>
              <p className="meta">{mode.summary}</p>
              <p className="meta">Слоты: {mode.slots}</p>
              {mode.connect ? <p className="connect">connect {mode.connect}</p> : null}
              <button className="btn primary" disabled={pending === mode.id} onClick={() => toggle(mode)}>
                {live ? "Остановить" : "Играть"}
              </button>
            </motion.article>
          );
        })}
        {UNAVAILABLE.map((title) => (
          <article key={title} className="mode-tile soon">
            <span className="pill warn">Нет слота</span>
            <h3>{title}</h3>
            <p className="meta">Нет слота в этой сети</p>
            <button className="btn" disabled>Играть</button>
          </article>
        ))}
      </section>
    </>
  );
}
