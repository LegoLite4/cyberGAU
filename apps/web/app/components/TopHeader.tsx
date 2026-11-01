"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "../../lib/api";

export function TopHeader() {
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
    <header className="topheader">
      <div className="topheader-left">
        <span className="game-chip">CS2</span>
        <span className="muted-chip">Бесплатно · без Premium</span>
      </div>
      <div className="userbox">
        {user ? (
          <>
            <Link href="/profile" className="user-pill">
              {user.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt="" /> : <span className="avatar" />}
              <span>{user.personaName}</span>
            </Link>
            <button type="button" className="btn" onClick={logout}>Выйти</button>
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
