import Link from "next/link";
import type { ReactNode } from "react";
import { env } from "@/lib/config/env";

const NAV_ITEMS = [
    { href: "/library", label: "Library" },
    { href: "/platforms", label: "Platforms" },
    { href: "/settings", label: "Settings" },
] as const;

export default function LibraryLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:outline-2 focus:outline-accent"
            >
                Skip to content
            </a>
            <div className="flex min-h-dvh flex-col">
                <header className="border-b border-line">
                    <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-6 py-4">
                        <Link
                            href="/"
                            className="text-sm font-semibold tracking-tight text-ink outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
                        >
                            {env.APP_NAME}
                        </Link>
                        <nav aria-label="Primary">
                            <ul className="flex items-center gap-5 text-sm">
                                {NAV_ITEMS.map((item) => (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            className="text-muted outline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </header>
                <div id="main" className="flex-1">
                    {children}
                </div>
            </div>
        </>
    );
}