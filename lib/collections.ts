import type { GameQuery } from "./games/query";

export const SMART_COLLECTIONS: { slug: string; name: string; description: string; query: GameQuery; href: string }[] = [
    { slug: "favorites", name: "Favorites", description: "The games you always come back to.", query: { favourite: true }, href: "/favorites" },
    { slug: "playing", name: "Currently playing", description: "Adventures already in progress.", query: { status: "playing", sort: "last-played" }, href: "/library?status=playing&sort=last-played" },
    { slug: "backlog", name: "Up next", description: "A little something to look forward to.", query: { status: "backlog" }, href: "/library?status=backlog" },
    { slug: "completed", name: "Completed", description: "The credits rolled. The memories stayed.", query: { status: "completed" }, href: "/library?status=completed" },
    { slug: "unplayed", name: "Yet to discover", description: "A fresh start, whenever you are ready.", query: { status: "unplayed" }, href: "/library?status=unplayed" },
];
