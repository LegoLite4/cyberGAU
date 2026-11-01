"use client";

import { useEffect, useState } from "react";
import { api, type LeaderboardRow } from "../../lib/api";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [period, setPeriod] = useState("month");
  const [mode, setMode] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams({ period, mode });
    api.leaderboard(`?${query.toString()}`)
      .then((result) => {
        setRows(result.rows);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [period, mode]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Лидерборд</p>
          <h1>ARENA LEADERS</h1>
          <p className="lead">Соревнуйтесь на локальной ноде. Очки считаются по завершённым лобби — без Premium и без оплаты.</p>
        </div>
      </section>

      <div className="toolbar">
        <div className="segment">
          <button type="button" className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>Текущий месяц</button>
          <button type="button" className={period === "global" ? "on" : ""} onClick={() => setPeriod("global")}>Global</button>
        </div>
        <div className="segment">
          <button type="button" className={mode === "all" ? "on" : ""} onClick={() => setMode("all")}>Все</button>
          <button type="button" className={mode === "5v5" ? "on" : ""} onClick={() => setMode("5v5")}>5x5</button>
          <button type="button" className={mode === "2v2" ? "on" : ""} onClick={() => setMode("2v2")}>2x2</button>
          <button type="button" className={mode === "1v1" ? "on" : ""} onClick={() => setMode("1v1")}>1x1</button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>Игрок</th>
              <th>Убийства</th>
              <th>HS%</th>
              <th>K/D</th>
              <th>Время</th>
              <th>Очки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.position}-${row.personaName}`}>
                <td>{row.position <= 3 ? ["🥇", "🥈", "🥉"][row.position - 1] : row.position}</td>
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    {row.avatarUrl ? <img className="avatar" src={row.avatarUrl} alt="" /> : <span className="avatar" />}
                    {row.personaName}
                  </span>
                </td>
                <td>{row.kills}</td>
                <td>{row.hsPercent}%</td>
                <td>{row.kd}</td>
                <td>{row.hours} ч</td>
                <td>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="empty">Пока нет данных.</p> : null}
      </div>
    </>
  );
}
