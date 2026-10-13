import type { Metadata, Viewport } from "next";
import { DM_Mono, Outfit } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { SITE } from "@/config/site";
import "./globals.css";

const body = Outfit({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const code = DM_Mono({ subsets: ["latin"], variable: "--font-code", weight: ["400", "500"], style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} · ${SITE.hook}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: `${SITE.name} · ${SITE.hook}`, description: SITE.description },
};

export const viewport: Viewport = { themeColor: "#f3efe6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable}`}>
      <body className="min-h-svh overflow-x-clip">
        <SiteHeader />
        {children}
        <SiteFooter />
        <WalletDialog />
      </body>
    </html>
  );
}
