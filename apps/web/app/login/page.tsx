"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const notice = new URLSearchParams(window.location.search).get("error");
    if (notice) setError(notice);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api.login(String(form.get("username") || ""), String(form.get("password") || ""));
      router.push("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
      setPending(false);
    }
  }

  return (
    <section className="panel auth" style={{ padding: 22 }}>
      <p className="kicker">Аккаунт</p>
      <h1>Вход</h1>
      <p className="lead">Основной вход — через Steam (как на площадках с лобби). Логин/пароль — запасной вариант для админа.</p>
      <p style={{ marginTop: 16 }}>
        <a className="btn primary" href="/backend/auth/steam">Войти через Steam</a>
      </p>
      <details style={{ marginTop: 22 }}>
        <summary className="meta" style={{ cursor: "pointer" }}>Вход логином и паролем</summary>
        <form className="form" onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label>Логин<input className="field" name="username" autoComplete="username" required minLength={3} maxLength={24} /></label>
          <label>Пароль<input className="field" name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn" disabled={pending}>{pending ? "Входим..." : "Войти"}</button>
          <p className="meta">Нет аккаунта? <Link href="/register">Регистрация</Link></p>
        </form>
      </details>
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
    </section>
  );
}
