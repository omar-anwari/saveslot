import { LibraryBrowser, type LibrarySearchParams } from "@/components/library/library-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibrarySearchParams> }) {
    return <LibraryBrowser params={await searchParams} />;
}
