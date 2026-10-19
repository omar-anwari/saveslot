import type { GameQuery } from "./games/query";

export const SMART_COLLECTIONS: { slug: string; name: string; description: string; query: GameQuery; href: string }[] = [
    { slug: "favorites", name: "Favorites", description: "Games you have marked as a favorite.", query: { favourite: true }, href: "/favorites" },
    { slug: "playing", name: "Currently playing", description: "Games marked as playing.", query: { status: "playing", sort: "last-played" }, href: "/library?status=playing&sort=last-played" },
    { slug: "backlog", name: "Up next", description: "Games marked as backlog.", query: { status: "backlog" }, href: "/library?status=backlog" },
    { slug: "completed", name: "Completed", description: "Games marked as completed.", query: { status: "completed" }, href: "/library?status=completed" },
    { slug: "unplayed", name: "Unplayed", description: "Games you have not played yet.", query: { status: "unplayed" }, href: "/library?status=unplayed" },
];
