import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Header } from "./components/Header";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "cyberGAU",
  description: "Локальные матчи CS2 и запуск серверов через Pterodactyl",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={manrope.className}>
        <Header />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
