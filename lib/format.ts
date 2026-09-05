export function formatPlaytime(totalSeconds: number): string {
    if (totalSeconds <= 0) return "Not played yet";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0 && minutes === 0) return "Under a minute";
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatRelative(date: Date, now: Date = new Date()): string {
    const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    }
    if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.floor(seconds / 86400);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}