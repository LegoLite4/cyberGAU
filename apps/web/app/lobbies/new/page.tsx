"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

const TYPES = [
  { id: "public", label: "Открытое" },
  { id: "password", label: "С паролем" },
  { id: "private", label: "Скрытое" },
] as const;

export default function NewLobbyPage() {
  const router = useRouter();
  const [maps, setMaps] = useState<string[]>(["de_dust2"]);
  const [formats, setFormats] = useState<string[]>(["1v1", "2v2", "5v5", "casual"]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [visibility, setVisibility] = useState("public");

  useEffect(() => {
    api.lobbies().then((result) => {
      setMaps(result.maps);
      setFormats(result.formats);
    }).catch(() => undefined);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const maxPing = String(form.get("maxPing") || "");
    const minHours = String(form.get("minHours") || "");
    try {
      const lobby = await api.createLobby({
        title: String(form.get("title") || ""),
        visibility,
        format: String(form.get("format") || "5v5"),
        map: String(form.get("map") || "de_dust2"),
        slots: Number(form.get("slots") || 10),
        password: String(form.get("password") || "") || undefined,
        maxPing: maxPing ? Number(maxPing) : undefined,
        minHours: minHours ? Number(minHours) : undefined,
      });
      router.push(`/lobbies/${lobby.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать лобби");
      setPending(false);
    }
  }

  return (
    <>
      <p className="kicker">Новый матч</p>
      <h1>Создать лобби</h1>
      <p className="lead">Открытое видно всем в сети. С паролем тоже в списке, но вход по паролю. Скрытое открывается только по ссылке.</p>
      <form className="form panel" onSubmit={onSubmit} style={{ marginTop: 18, padding: 18 }}>
        <div>
          <h2>Тип лобби</h2>
          <div className="segment" role="group" aria-label="Тип лобби">
            {TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={visibility === type.id ? "on" : ""}
                onClick={() => setVisibility(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
        <label>Название<input className="field" name="title" minLength={3} maxLength={48} required placeholder="Вечерний мир" /></label>
        {visibility === "password" ? <label>Пароль лобби<input className="field" name="password" required /></label> : null}
        <div className="form-grid">
          <label>Формат
            <select className="select" name="format">{formats.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label>Карта
            <select className="select" name="map">{maps.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label>Слоты<input className="field" name="slots" type="number" min={2} max={32} defaultValue={10} /></label>
          <label>Максимальный пинг, мс<input className="field" name="maxPing" type="number" min={1} max={500} placeholder="не проверять" /></label>
          <label>Минимум часов CS2<input className="field" name="minHours" type="number" min={0} placeholder="не проверять" /></label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn primary" disabled={pending}>{pending ? "Создаём..." : "Создать лобби"}</button>
      </form>
    </>
  );
}
