import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { TopBar } from "@/components/shell/top-bar";
import { env } from "@/lib/config/env";

export default function LibraryLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-dvh">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
            >
                Skip to content
            </a>
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
                <TopBar showSignOut={env.appPasswordEnabled} />
                <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">
                    {children}
                </main>
            </div>
            <BottomNav />
        </div>
    );
}
