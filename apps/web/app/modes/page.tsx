"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, statusLabel, type ModeCard } from "../../lib/api";

const CHIP_ORDER = ["all", "dm", "duels", "retake", "competitive", "wingman", "arena", "knife", "awp", "bhop", "surf"] as const;

export default function ModesPage() {
  const [modes, setModes] = useState<ModeCard[]>([]);
  const [comingSoon, setComingSoon] = useState<ModeCard[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");
  const [ready, setReady] = useState(false);

  function load() {
    api.modes()
      .then((result) => {
        setModes(result.modes);
        setComingSoon(result.comingSoon || []);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setReady(true));
  }

  useEffect(() => {
    load();
  }, []);

  const allCards = useMemo(() => {
    const soon = comingSoon.map((mode) => ({ ...mode, playable: false, status: mode.status || "soon" }));
    return [...modes, ...soon];
  }, [modes, comingSoon]);

  const chips = useMemo(() => {
    const ids = new Set(allCards.map((mode) => mode.id));
    return CHIP_ORDER.filter((id) => id === "all" || ids.has(id));
  }, [allCards]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCards.filter((mode) => {
      if (filter !== "all" && mode.id !== filter) return false;
      if (!q) return true;
      return `${mode.title} ${mode.summary} ${mode.id}`.toLowerCase().includes(q);
    });
  }, [allCards, filter, search]);

  async function toggle(mode: ModeCard) {
    if (!mode.playable) {
      setNotice(`«${mode.title}» пока недоступен на этой ноде — режим появится позже. Всё бесплатно, без Premium.`);
      return;
    }
    setPending(mode.id);
    setError("");
    setNotice("");
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

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Режимы</p>
          <h1>Выберите режим</h1>
          <p className="lead">Живые режимы стартуют на пуле CS2. Остальные карточки кликабельны и бесплатны — без подписки.</p>
        </div>
        <Link className="btn primary" href="/lobbies/new">Создать лобби +</Link>
      </section>

      <div className="chip-row">
        {chips.map((id) => (
          <button
            key={id}
            type="button"
            className={filter === id ? "chip on" : "chip"}
            onClick={() => setFilter(id)}
          >
            {id === "all" ? "Все" : id.toUpperCase()}
          </button>
        ))}
        <input
          className="search"
          placeholder="Поиск режима"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {notice ? <p className="toast">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!ready ? <p className="empty">Загрузка режимов…</p> : null}

      <div className="mode-grid">
        {visible.map((mode) => {
          const live = mode.status === "live";
          const soon = !mode.playable;
          return (
            <article
              key={mode.id}
              className={`mode-card${live ? " live" : ""}${soon ? " soon" : ""}`}
              onClick={() => toggle(mode)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(mode);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="mode-art">
                <span className={`pill${live ? " live" : soon ? " soon" : ""}`}>
                  {soon ? "Скоро" : statusLabel(mode.status)}
                </span>
                <span className="pill">{mode.playersOnline ?? 0} в игре</span>
              </div>
              <div className="mode-body">
                <p className="meta">{mode.map || "—"} · {mode.slots || "—"} слотов</p>
                <h3>{mode.title}</h3>
                <p className="meta">{mode.summary}</p>
                {live && mode.connect ? <p className="connect">{mode.connect}</p> : null}
                <button
                  type="button"
                  className="btn primary"
                  disabled={pending === mode.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(mode);
                  }}
                >
                  {pending === mode.id ? "…" : soon ? "Подробнее" : live ? "Остановить" : "Играть"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
