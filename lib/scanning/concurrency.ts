export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("Concurrency limit must be a positive integer.");
    }
    const results = new Array<R>(items.length);
    let cursor = 0;
    async function drain(): Promise<void> {
        for (; ;) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            results[index] = await worker(items[index]!, index);
        }
    }
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => drain()));
    return results;
}