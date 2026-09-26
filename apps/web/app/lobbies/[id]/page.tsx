"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, measurePing, statusLabel, visibilityLabel, type ChatMessage, type Lobby } from "../../../lib/api";

export default function LobbyPage() {
  const params = useParams<{ id: string }>();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reload() {
    const next = await api.lobby(params.id);
    setLobby(next);
    if (next.members.some((member) => member.id === next.owner.id) || next.members.length > 0) {
      const chat = await api.messages(params.id).catch(() => ({ messages: [] }));
      setMessages(chat.messages);
    }
  }

  useEffect(() => {
    reload().catch((reason: Error) => setError(reason.message));
    const timer = setInterval(() => {
      reload().catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [params.id]);

  async function join() {
    setPending(true);
    setError("");
    try {
      const pingMs = await measurePing().catch(() => undefined);
      const next = await api.join(params.id, { password, pingMs });
      setLobby(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  async function start() {
    setPending(true);
    setError("");
    try {
      setLobby(await api.start(params.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось запустить");
    } finally {
      setPending(false);
    }
  }

  async function stop() {
    setPending(true);
    try {
      setLobby(await api.stop(params.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось остановить");
    } finally {
      setPending(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    const message = await api.sendMessage(params.id, draft.trim());
    setMessages((current) => [...current, message]);
    setDraft("");
  }

  async function copyConnect() {
    if (!lobby?.connect) return;
    await navigator.clipboard.writeText(`connect ${lobby.connect}`);
    setCopied(true);
  }

  async function copyInvite() {
    const link = `${window.location.origin}/invite/${lobby?.inviteCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (!lobby) return <p className="lead">{error || "Загрузка лобби..."}</p>;
  const invite = typeof window === "undefined" ? "" : `${window.location.origin}/invite/${lobby.inviteCode}`;

  return (
    <div className="split">
      <section className="panel" style={{ padding: 18 }}>
        <div className="meta">
          <span className="pill">{visibilityLabel(lobby.visibility)}</span>
          <span className={lobby.status === "live" ? "pill live" : "pill"}>{statusLabel(lobby.status)}</span>
        </div>
        <h1>{lobby.title}</h1>
        <p className="meta">{lobby.map} · {lobby.format} · {lobby.members.length}/{lobby.slots}</p>
        {lobby.maxPing ? <p className="meta">Пинг до {lobby.maxPing} мс</p> : null}
        {lobby.minHours ? <p className="meta">От {lobby.minHours} часов CS2</p> : null}
        {lobby.error ? <p className="error">{lobby.error}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {lobby.connect ? (
          <div className="stack" style={{ marginTop: 14 }}>
            <p className="connect">connect {lobby.connect}</p>
            <button className="btn" onClick={copyConnect}>{copied ? "Скопировано" : "Копировать connect"}</button>
          </div>
        ) : null}
        <div className="row" style={{ marginTop: 14 }}>
          {lobby.hasPassword ? <input className="field" style={{ width: "auto" }} placeholder="Пароль" value={password} onChange={(event) => setPassword(event.target.value)} /> : null}
          <button className="btn" disabled={pending} onClick={join}>Войти</button>
          {lobby.isOwner && lobby.status !== "ended" ? <button className="btn primary" disabled={pending} onClick={start}>Запустить</button> : null}
          {lobby.isOwner && lobby.status === "live" ? <button className="btn danger" disabled={pending} onClick={stop}>Остановить</button> : null}
        </div>
        <h2 style={{ marginTop: 22 }}>Приглашение</h2>
        <p className="connect">{invite}</p>
        <button className="btn" onClick={copyInvite}>Копировать ссылку</button>
        <h2 style={{ marginTop: 22 }}>Состав</h2>
        <div className="members">
          {lobby.members.map((member) => (
            <div className="member" key={member.id}>
              {member.avatarUrl ? <img className="avatar" src={member.avatarUrl} alt="" /> : <span className="avatar" />}
              <span>{member.personaName}</span>
              {member.pingMs !== null ? <span className="meta">{member.pingMs} мс</span> : null}
            </div>
          ))}
        </div>
      </section>
      <aside className="panel chat" style={{ padding: 18 }}>
        <h2>Чат</h2>
        <div className="messages">
          {messages.length === 0 ? <p className="empty">Сообщений пока нет.</p> : null}
          {messages.map((message) => (
            <div className="bubble" key={message.id}>
              <strong>{message.author}</strong>
              {message.body}
            </div>
          ))}
        </div>
        <form onSubmit={send} className="row">
          <input className="field" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Сообщение" />
          <button className="btn primary">Отправить</button>
        </form>
      </aside>
    </div>
  );
}
