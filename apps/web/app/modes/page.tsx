"use client";

import { useEffect, useState } from "react";
import { api, type ModeCard } from "../../lib/api";

export default function ModesPage() {
  const [modes, setModes] = useState<ModeCard[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  function load() {
    api.modes().then((result) => setModes(result.modes)).catch((reason: Error) => setError(reason.message));
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

  return (
    <>
      <section className="hero">
        <div>
          <h1>Постоянные режимы</h1>
          <p className="lead">Deathmatch, Retake, Duels, Wingman и Competitive живут в том же пуле серверов. Старт занимает свободный слот, пока его не остановят.</p>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}
      <section className="grid">
        {modes.map((mode) => (
          <article key={mode.id} className="card">
            <div className="meta">
              <span className={mode.status === "live" ? "pill live" : "pill"}>{mode.status === "live" ? "Запущен" : "Выключен"}</span>
              <span>{mode.map}</span>
            </div>
            <h3>{mode.title}</h3>
            <p className="meta">{mode.summary}</p>
            <p className="meta">Слоты: {mode.slots}</p>
            {mode.connect ? <p className="connect">connect {mode.connect}</p> : null}
            <button className="btn primary" disabled={pending === mode.id} onClick={() => toggle(mode)}>
              {mode.status === "live" ? "Остановить" : "Запустить"}
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
