import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Sidebar } from "./components/Sidebar";
import { TopHeader } from "./components/TopHeader";
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
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <TopHeader />
            <main className="page">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
