"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, measurePing, type Lobby } from "../../../lib/api";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.invite(params.code).then(setLobby).catch((reason: Error) => setError(reason.message));
  }, [params.code]);

  async function join() {
    if (!lobby) return;
    setError("");
    try {
      const pingMs = await measurePing().catch(() => undefined);
      await api.join(lobby.id, { password, pingMs });
      router.push(`/lobbies/${lobby.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось принять приглашение");
    }
  }

  if (!lobby) return <p className="lead">{error || "Ищем приглашение..."}</p>;

  return (
    <section className="panel auth" style={{ padding: 22 }}>
      <p className="kicker">Приглашение</p>
      <h1>{lobby.title}</h1>
      <p className="lead">{lobby.owner.personaName} зовёт в лобби {lobby.format} на {lobby.map}.</p>
      {lobby.hasPassword ? <input className="field" placeholder="Пароль" value={password} onChange={(event) => setPassword(event.target.value)} /> : null}
      {error ? <p className="error">{error}</p> : null}
      <button className="btn primary" onClick={join} style={{ marginTop: 12 }}>Принять приглашение</button>
    </section>
  );
}
