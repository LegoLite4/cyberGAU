"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "../../lib/api";

const links = [
  { href: "/", label: "Матчи" },
  { href: "/modes", label: "Режимы" },
  { href: "/profile", label: "Профиль" },
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
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="userbox">
        {user ? (
          <>
            {user.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt="" /> : <span className="avatar" />}
            <span>{user.personaName}</span>
            <button className="btn" onClick={logout}>Выйти</button>
          </>
        ) : (
          <a className="btn primary" href="/backend/auth/steam">Войти через Steam</a>
        )}
      </div>
    </header>
  );
}
