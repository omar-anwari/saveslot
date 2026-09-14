import type { ReactNode } from "react";
import {
    FavoritesIcon,
    HomeIcon,
    LibraryIcon,
    SavesIcon,
    SettingsIcon,
    SystemsIcon,
    CollectionsIcon,
} from "@/components/shell/icons";

export interface NavItem {
    href: string;
    label: string;
    icon: ReactNode;
}

export const PRIMARY_NAV: NavItem[] = [
    { href: "/", label: "Home", icon: <HomeIcon /> },
    { href: "/library", label: "Library", icon: <LibraryIcon /> },
    { href: "/platforms", label: "Systems", icon: <SystemsIcon /> },
    { href: "/collections", label: "Collections", icon: <CollectionsIcon /> },
    { href: "/favorites", label: "Favorites", icon: <FavoritesIcon /> },
    { href: "/saves", label: "Saves", icon: <SavesIcon /> },
];

export const SECONDARY_NAV: NavItem[] = [
    { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

export const MOBILE_NAV: NavItem[] = [
    PRIMARY_NAV[0]!,
    PRIMARY_NAV[1]!,
    PRIMARY_NAV[2]!,
    PRIMARY_NAV[5]!,
    SECONDARY_NAV[0]!,
];

export function isActive(pathname: string, href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}
