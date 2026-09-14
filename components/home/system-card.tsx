import Link from "next/link";
import { SystemLogo } from "@/components/library/system-logo";
import { systemLogoBackdrop } from "@/lib/platforms/tint";
import { ArrowRightIcon } from "@/components/shell/icons";

export function SystemCard({
    slug,
    name,
    gameCount,
}: {
    slug: string;
    name: string;
    gameCount: number;
}) {
    const backdrop = systemLogoBackdrop(slug);
    return (
        <li>
            <Link
                href={`/platforms/${slug}`}
                className="group block overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-line-strong hover:bg-surface-hover"
            >
                <div
                    className="flex aspect-[16/9] items-center justify-center overflow-hidden p-6"
                    style={{ background: backdrop }}
                >
                    <SystemLogo slug={slug} className="h-full w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="relative p-3.5">
                <p className="truncate text-xs font-medium">{name}</p>
                <p className="mt-1 text-[11px] text-muted">
                    {gameCount} game{gameCount === 1 ? "" : "s"}
                </p>
                <span className="absolute bottom-3.5 right-3.5 text-subtle group-hover:text-ink"><ArrowRightIcon /></span>
                </div>
            </Link>
        </li>
    );
}
