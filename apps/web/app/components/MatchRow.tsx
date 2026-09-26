"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { statusLabel, visibilityLabel, type Lobby } from "../../lib/api";

export function MatchRow({ lobby, index = 0 }: { lobby: Lobby; index?: number }) {
  const reduce = useReducedMotion();
  const mapName = lobby.map.replace(/^de_/, "");
  return (
    <motion.article
      className="match-row"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : Math.min(index, 8) * 0.04 }}
    >
      <div className="map-chip">{mapName}</div>
      <div>
        <h3>{lobby.title}</h3>
        <p className="meta">Хост {lobby.owner.personaName} · {visibilityLabel(lobby.visibility)}</p>
      </div>
      <p className="meta">{lobby.map} · {lobby.format} · {lobby.members.length}/{lobby.slots}</p>
      <span className={lobby.status === "live" ? "pill live" : "pill"}>{statusLabel(lobby.status)}</span>
      <Link className="btn primary" href={`/lobbies/${lobby.id}`}>Войти</Link>
    </motion.article>
  );
}
