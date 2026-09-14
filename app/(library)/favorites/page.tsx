import { LibraryBrowser, type LibrarySearchParams } from "@/components/library/library-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Favorites" };

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
    return <LibraryBrowser params={await searchParams} favoritesOnly />;
}
