import type { Metadata } from "next";
import { Header } from "./components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "cyberGAU",
  description: "Локальные матчи CS2 и запуск серверов через Pterodactyl",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
