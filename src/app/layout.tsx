import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Controle Fácil",
    title: "Controle Fácil — Seu dinheiro organizado, sua vida mais tranquila",
    description: "Controle gastos, contas, metas e dívidas com clareza. Comece grátis, sem cartão de crédito.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Controle Fácil" }],
  },
  appleWebApp: { capable: true, title: "Controle Fácil", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  title: {
    default: "Controle Fácil — Seu dinheiro organizado, sua vida mais tranquila",
    template: "%s · Controle Fácil",
  },
  description:
    "Controle seus gastos, organize contas e metas e acompanhe sua vida financeira com clareza. Comece grátis.",
  applicationName: "Controle Fácil",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Renderização por requisição: necessária para aplicar o nonce da CSP em todas as páginas.
  await connection();
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
