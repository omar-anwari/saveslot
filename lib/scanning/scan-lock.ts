export class ScanInProgressError extends Error {
  readonly activeScanRunId: string;
  constructor(activeScanRunId: string) {
    super(`A scan is already running (${activeScanRunId}).`);
    this.name = "ScanInProgressError";
    this.activeScanRunId = activeScanRunId;
  }
}

const globalForLock = globalThis as typeof globalThis & {
  __saveslotScanLock?: { scanRunId: string } | null;
};

export function currentScanRunId(): string | null {
  return globalForLock.__saveslotScanLock?.scanRunId ?? null;
}

export function acquireScanLock(scanRunId: string): void {
  const active = currentScanRunId();
  if (active !== null) throw new ScanInProgressError(active);
  globalForLock.__saveslotScanLock = { scanRunId };
}

export function releaseScanLock(): void {
  globalForLock.__saveslotScanLock = null;
}