import type { Metadata } from "next";
import { AppView } from "@/components/app/AppView";

export const metadata: Metadata = { title: "Vault" };

export default function AppPage() {
  return (
    <main className="shell pt-8 sm:pt-12">
      <AppView />
    </main>
  );
}
