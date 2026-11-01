"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const nav: Array<{ href: string; label: string; badgeKey?: "missions"; icon: string }> = [
  { href: "/modes", label: "Режимы", icon: "▶" },
  { href: "/", label: "Матчи", icon: "☰" },
  { href: "/missions", label: "Миссии", badgeKey: "missions", icon: "★" },
  { href: "/pickem", label: "Предиктор", icon: "◎" },
  { href: "/skins", label: "Выбрать скины", icon: "◈" },
  { href: "/leaderboard", label: "Лидерборд", icon: "♛" },
  { href: "/profile", label: "Профиль", icon: "☺" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [missionBadge, setMissionBadge] = useState("0/5");

  useEffect(() => {
    api.missions()
      .then((result) => setMissionBadge(`${result.completed}/${result.total}`))
      .catch(() => setMissionBadge("0/5"));
  }, [pathname]);

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="mark">G</span>
        <span>
          <strong>cyberGAU</strong>
          <small>CS2 LAN</small>
        </span>
      </Link>
      <nav className="sidebar-nav">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.badgeKey === "missions" ? missionBadge : null;
          return (
            <Link key={item.href} href={item.href} className={active ? "side-link active" : "side-link"}>
              <span className="side-ico" aria-hidden>{item.icon}</span>
              <span className="side-label">{item.label}</span>
              {badge ? <span className="badge">{badge}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <a href="https://discord.com" target="_blank" rel="noreferrer" title="Discord">D</a>
        <a href="https://x.com" target="_blank" rel="noreferrer" title="X">X</a>
        <a href="https://youtube.com" target="_blank" rel="noreferrer" title="YouTube">Y</a>
      </div>
    </aside>
  );
}
