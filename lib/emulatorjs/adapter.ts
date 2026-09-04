interface EmscriptenFS {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  analyzePath(path: string): { exists: boolean };
  unlink(path: string): void;
  mkdir(path: string): void;
}

interface GameManagerLike {
  FS: EmscriptenFS;
  getSaveFile(): Uint8Array | null;
  getSaveFilePath(): string;
  saveSaveFiles(): void;
  loadSaveFiles(): void;
  supportsStates(): boolean;
  getState(): Uint8Array;
  loadState(state: Uint8Array): void;
  screenshot(): Promise<Uint8Array>;
  restart(): void;
}

interface EmulatorLike {
  gameManager?: GameManagerLike;
  paused: boolean;
  pause(): void;
  play(): void;
  coreName: string;
  saveFileExt: string;
}

declare global {
  interface Window {
    EJS_emulator?: EmulatorLike;
  }
}

export class EmulatorNotReadyError extends Error {
  constructor(message = "The emulator did not become ready in time.") {
    super(message);
    this.name = "EmulatorNotReadyError";
  }
}

export class EmulatorContractError extends Error {
  constructor(missing: string[]) {
    super(
      `EmulatorJS is missing expected methods: ${missing.join(", ")}. ` +
      "The pinned version may have changed. See lib/emulatorjs/contract.ts.",
    );
    this.name = "EmulatorContractError";
  }
}

const REQUIRED_METHODS = [
  "getSaveFile",
  "getSaveFilePath",
  "saveSaveFiles",
  "loadSaveFiles",
  "supportsStates",
  "getState",
  "loadState",
  "screenshot",
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AdapterOptions {
  settleMs?: number;
}

export class EmulatorAdapter {
  #emulator: EmulatorLike | null = null;
  readonly #settleMs: number;
  constructor(options: AdapterOptions = {}) {
    this.#settleMs = options.settleMs ?? 250;
  }
  async waitUntilReady(timeoutMs = 60000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (; ;) {
      const candidate = window.EJS_emulator;
      if (candidate?.gameManager) {
        const missing = REQUIRED_METHODS.filter(
          (name) => typeof candidate.gameManager?.[name] !== "function",
        );
        if (missing.length > 0) throw new EmulatorContractError(missing);
        this.#emulator = candidate;
        return;
      }
      if (Date.now() > deadline) throw new EmulatorNotReadyError();
      await delay(100);
    }
  }
  get ready(): boolean {
    return this.#emulator?.gameManager !== undefined;
  }
  get coreName(): string | null {
    return this.#emulator?.coreName ?? null;
  }
  get saveFileExtension(): string | null {
    return this.#emulator?.saveFileExt ?? null;
  }
  supportsStates(): boolean {
    return this.#manager().supportsStates();
  }
  saveFilePath(): string {
    return this.#manager().getSaveFilePath();
  }
  async waitForSavePath(timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (; ;) {
      let candidate = "";
      try {
        candidate = this.#manager().getSaveFilePath();
      } catch {
        candidate = "";
      }
      if (candidate.length > 1) return candidate;
      if (Date.now() > deadline) {
        throw new EmulatorNotReadyError(
          "The core never reported a save file path.",
        );
      }
      await delay(200);
    }
  }
  async pause(): Promise<void> {
    const emulator = this.#require();
    if (!emulator.paused) emulator.pause();
    await delay(0);
  }
  async resume(): Promise<void> {
    const emulator = this.#require();
    if (emulator.paused) emulator.play();
    await delay(0);
  }
  async flushSave(): Promise<void> {
    this.#manager().saveSaveFiles();
    await delay(this.#settleMs);
  }
  async readSave(): Promise<Uint8Array | null> {
    await this.flushSave();
    const bytes = this.#manager().getSaveFile();
    return bytes && bytes.length > 0 ? bytes : null;
  }
  async loadSave(bytes: Uint8Array): Promise<void> {
    const manager = this.#manager();
    const path = manager.getSaveFilePath();
    let current = "";
    for (const segment of path.split("/").slice(0, -1)) {
      if (segment === "") continue;
      current += `/${segment}`;
      if (!manager.FS.analyzePath(current).exists) manager.FS.mkdir(current);
    }
    if (manager.FS.analyzePath(path).exists) manager.FS.unlink(path);
    manager.FS.writeFile(path, bytes);
    manager.loadSaveFiles();
    await delay(this.#settleMs);
  }
  async readState(): Promise<Uint8Array> {
    const manager = this.#manager();
    if (!manager.supportsStates()) {
      throw new Error(`${this.coreName ?? "This core"} does not support states.`);
    }
    return manager.getState();
  }
  async loadState(bytes: Uint8Array): Promise<void> {
    this.#manager().loadState(bytes);
    await delay(this.#settleMs);
  }
  async captureScreenshot(): Promise<Uint8Array> {
    return this.#manager().screenshot();
  }
  async exit(): Promise<void> {
    if (this.#emulator) await this.pause();
    this.#emulator = null;
  }
  #require(): EmulatorLike {
    if (!this.#emulator) throw new EmulatorNotReadyError("Call waitUntilReady first.");
    return this.#emulator;
  }
  #manager(): GameManagerLike {
    const manager = this.#require().gameManager;
    if (!manager) throw new EmulatorNotReadyError("Game manager is not available.");
    return manager;
  }
}