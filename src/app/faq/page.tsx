import type { Metadata } from "next";
import { Faq } from "@/components/Faq";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <main className="shell grid gap-8 pt-10 sm:pt-14 lg:grid-cols-[1fr_2fr]">
      <div>
        <h1 className="h2">FAQ</h1>
        <p className="mt-3 text-muted">What BLINDSPOT does, what it doesn&apos;t, and who holds the money.</p>
      </div>
      <Faq />
    </main>
  );
}
