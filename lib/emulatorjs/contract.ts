export const PINNED_VERSION = "4.2.3";

export const REQUIRED_GAME_MANAGER_METHODS = [
    "getSaveFile",
    "getSaveFilePath",
    "saveSaveFiles",
    "loadSaveFiles",
    "supportsStates",
    "getState",
    "loadState",
    "screenshot",
    "restart",
] as const;

export const REQUIRED_EMULATOR_METHODS = ["pause", "play"] as const;

export const REQUIRED_EJS_GLOBALS = [
    "EJS_player",
    "EJS_gameUrl",
    "EJS_core",
    "EJS_pathtodata",
    "EJS_gameName",
    "EJS_gameID",
    "EJS_startOnLoaded",
    "EJS_threads",
    "EJS_defaultOptions",
    "EJS_emulator",
    "EJS_ready",
    "EJS_onGameStart",
    "EJS_onSaveSave",
    "EJS_onLoadSave",
    "EJS_onSaveState",
    "EJS_onLoadState",
] as const;

export const ABSENT_IN_PINNED_BUILD = [
    "EJS_onSaveUpdate",
    "EJS_onExit",
    "EJS_fixedSaveInterval",
] as const;