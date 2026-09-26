"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api.register(String(form.get("username") || ""), String(form.get("password") || ""));
      router.push("/profile");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось зарегистрироваться");
      setPending(false);
    }
  }

  return (
    <>
      <h1>Регистрация</h1>
      <p className="lead">Этот логин открывает лобби и режимы. Скины живут в Steam: привязка будет отдельно в профиле.</p>
      <form className="form panel" onSubmit={onSubmit} style={{ marginTop: 18 }}>
        <label>Логин<input className="field" name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" /></label>
        <label>Пароль<input className="field" name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Создаём..." : "Создать аккаунт"}</button>
        <p className="meta">Уже есть аккаунт? <Link href="/login">Войти</Link></p>
      </form>
    </>
  );
}
