"use client";

import { useEffect, useState } from "react";
import { api, type PickemMatch } from "../../lib/api";

export default function PickemPage() {
  const [matches, setMatches] = useState<PickemMatch[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");

  function load() {
    api.pickem()
      .then((result) => {
        setMatches(result.matches);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function vote(id: string, side: "a" | "b") {
    setPending(`${id}:${side}`);
    setNotice("");
    try {
      const result = await api.votePickem(id, side);
      setMatches(result.matches);
      setNotice("Голос принят. Предиктор бесплатный — без ставок и Premium.");
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
          <p className="kicker">Предиктор</p>
          <h1>Угадайте исход</h1>
          <p className="lead">Локальные карточки матчей для атмосферы Cybershoke. Без реальных ставок и оплаты.</p>
        </div>
      </section>
      {notice ? <p className="toast">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="pickem-grid">
        {matches.map((match) => (
          <article key={match.id} className="card pickem-card">
            <h3>{match.title}</h3>
            <div className="pickem-sides">
              <button
                type="button"
                className={match.vote === "a" ? "btn primary" : "btn"}
                disabled={pending.startsWith(match.id)}
                onClick={() => vote(match.id, "a")}
              >
                {match.sideA}
              </button>
              <span className="meta">vs</span>
              <button
                type="button"
                className={match.vote === "b" ? "btn primary" : "btn"}
                disabled={pending.startsWith(match.id)}
                onClick={() => vote(match.id, "b")}
              >
                {match.sideB}
              </button>
            </div>
            {match.vote ? <p className="ok">Ваш выбор: {match.vote === "a" ? match.sideA : match.sideB}</p> : <p className="meta">Голос ещё не отдан</p>}
          </article>
        ))}
      </div>
    </>
  );
}
