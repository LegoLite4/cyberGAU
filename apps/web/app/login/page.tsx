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
    <>
      <h1>Вход</h1>
      <p className="lead">Логин и пароль cyberGAU. Steam для игры не нужен: он подключается в профиле и только для скинченджера.</p>
      <form className="form panel" onSubmit={onSubmit} style={{ marginTop: 18 }}>
        <label>Логин<input className="field" name="username" autoComplete="username" required minLength={3} maxLength={24} /></label>
        <label>Пароль<input className="field" name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Входим..." : "Войти"}</button>
        <p className="meta">Нет аккаунта? <Link href="/register">Регистрация</Link></p>
      </form>
    </>
  );
}
