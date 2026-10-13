import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { SITE } from "@/config/site";
import "./globals.css";

const head = Archivo({ subsets: ["latin"], variable: "--font-head", axes: ["wdth"] });
const body = Geist({ subsets: ["latin"], variable: "--font-body" });
const code = Geist_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} · ${SITE.hook}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: `${SITE.name} · ${SITE.hook}`, description: SITE.description },
};

export const viewport: Viewport = { themeColor: "#f2f0ea" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} ${code.variable}`}>
      <body className="min-h-svh">
        <SiteHeader />
        {children}
        <SiteFooter />
        <WalletDialog />
      </body>
    </html>
  );
}
