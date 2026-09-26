import Link from "next/link";
import { statusLabel, visibilityLabel, type Lobby } from "../../lib/api";

export function MatchRow({ lobby }: { lobby: Lobby }) {
  const mapName = lobby.map.replace(/^de_/, "");
  return (
    <article className="match-row">
      <div className="map-chip">{mapName}</div>
      <div>
        <h3>{lobby.title}</h3>
        <p className="meta">Хост {lobby.owner.personaName} · {visibilityLabel(lobby.visibility)}</p>
      </div>
      <p className="meta">{lobby.map} · {lobby.format} · {lobby.members.length}/{lobby.slots}</p>
      <span className={lobby.status === "live" ? "pill live" : "pill"}>{statusLabel(lobby.status)}</span>
      <Link className="btn primary" href={`/lobbies/${lobby.id}`}>Войти</Link>
    </article>
  );
}
