import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function advertiseHost(): string {
  return env("ADVERTISE_HOST", "127.0.0.1");
}

export function publicWebUrl(): string {
  return env("PUBLIC_WEB_URL", "http://localhost:3000").replace(/\/$/, "");
}

export function pterodactylConfigured(): boolean {
  return Boolean(env("PTERODACTYL_URL") && env("PTERODACTYL_APP_KEY") && env("PTERODACTYL_CLIENT_KEY"));
}

export function mockServers(): boolean {
  return env("PTERODACTYL_MOCK") === "1";
}
