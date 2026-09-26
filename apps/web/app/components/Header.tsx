"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "../../lib/api";

const links: Array<{ href: string; label: string; badge?: string; match?: string }> = [
  { href: "/modes", label: "Режимы" },
  { href: "/", label: "Матчи" },
  { href: "/missions", label: "Миссии", badge: "0/5" },
  { href: "/pickem", label: "Pick'em" },
  { href: "/skins", label: "Выбрать скины" },
  { href: "/leaderboard", label: "Лидерборд" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await api.logout();
    setUser(null);
    router.push("/");
  }

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="mark">G</span>
        cyberGAU
      </Link>
      <nav className="nav">
        {links.map((link) => {
          const match = link.match || link.href;
          const active = match === "/" ? pathname === "/" : pathname === match;
          return (
            <Link key={link.href} href={link.href} className={active ? "active" : ""}>
              {link.label}
              {link.badge ? <span className="badge">{link.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="userbox">
        {user ? (
          <>
            <Link href="/profile" className="userbox">
              {user.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt="" /> : <span className="avatar" />}
              <span>{user.personaName}</span>
            </Link>
            <button className="btn" onClick={logout}>Выйти</button>
          </>
        ) : (
          <>
            <Link className="btn" href="/login">Войти</Link>
            <Link className="btn primary" href="/register">Регистрация</Link>
          </>
        )}
      </div>
    </header>
  );
}
