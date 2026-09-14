"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/shell/icons";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "@/components/shell/nav-items";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
    return (
        <li>
            <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`flex h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors lg:justify-start ${
                    active
                        ? "bg-accent-soft text-[#9B86FF]"
                        : "text-muted hover:bg-surface-hover hover:text-ink"
                } justify-center`}
            >
                <span className="shrink-0">{item.icon}</span>
                <span className="hidden lg:inline">{item.label}</span>
            </Link>
        </li>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    return (
        <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-elevated px-2 py-5 md:flex md:w-[72px] lg:w-[220px] lg:px-4 xl:w-60">
            <Link
                href="/"
                className="mb-8 flex h-8 items-center justify-center gap-2.5 rounded-sm px-1 text-lg font-semibold tracking-tight text-ink lg:justify-start lg:px-3"
            >
                <LogoMark />
                <span className="hidden lg:inline">SaveSlot</span>
            </Link>
            <nav aria-label="Primary" className="flex flex-1 flex-col">
                <p className="mb-3 hidden px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle lg:block">Your library</p>
                <ul className="flex flex-col gap-1">
                    {PRIMARY_NAV.map((item) => (
                        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                    ))}
                </ul>
                <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
                    {SECONDARY_NAV.map((item) => (
                        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                    ))}
                </ul>
            </nav>
        </aside>
    );
}
