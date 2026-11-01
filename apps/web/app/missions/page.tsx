"use client";

import { useEffect, useState } from "react";
import { api, type MissionItem } from "../../lib/api";

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(5);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");

  function load() {
    api.missions()
      .then((result) => {
        setMissions(result.missions);
        setCompleted(result.completed);
        setTotal(result.total);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function claim(id: string) {
    setPending(id);
    setNotice("");
    try {
      const result = await api.claimMission(id);
      setMissions(result.missions);
      setCompleted(result.completed);
      setTotal(result.total);
      setNotice("Миссия отмечена. Награды косметические — всё бесплатно.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Нужен вход");
    } finally {
      setPending("");
    }
  }

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Миссии</p>
          <h1>Ежедневные задания</h1>
          <p className="lead">Прогресс {completed}/{total}. Без боевого пропуска и оплаты — просто играйте на cyberGAU.</p>
        </div>
      </section>
      {notice ? <p className="toast">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="mission-grid">
        {missions.map((mission) => (
          <article key={mission.id} className="card mission-card">
            <h3>{mission.title}</h3>
            <p className="meta">{mission.description}</p>
            <p className="meta">{mission.progress}/{mission.target}</p>
            <div className="progress"><span style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }} /></div>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 12 }}
              disabled={mission.done || pending === mission.id}
              onClick={() => claim(mission.id)}
            >
              {mission.done ? "Готово" : pending === mission.id ? "…" : "Отметить"}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
