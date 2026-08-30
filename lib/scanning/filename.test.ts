import { describe, expect, it } from "vitest";

import { parseFilename } from "./filename.ts";

describe("parseFilename", () => {
  it("extracts the extension and keeps a plain title", () => {
    const result = parseFilename("Super Mario World.sfc");
    expect(result.extension).toBe(".sfc");
    expect(result.title).toBe("Super Mario World");
    expect(result.sortTitle).toBe("super mario world");
  });

  it("extracts region, revision and status tags", () => {
    const result = parseFilename("Chrono Trigger (USA) (Rev 1) [!].sfc");
    expect(result.title).toBe("Chrono Trigger");
    expect(result.region).toBe("USA");
    expect(result.revision).toBe("1");
    expect(result.statusTags).toEqual(["!"]);
  });

  it("handles multi-region and language lists", () => {
    const result = parseFilename("Pokemon Crystal (USA, Europe) (En,Fr,De).gbc");
    expect(result.title).toBe("Pokemon Crystal");
    expect(result.region).toBe("USA, Europe");
    expect(result.languages).toEqual(["En", "Fr", "De"]);
  });

  it("moves a trailing article to the front and strips it for sorting", () => {
    const result = parseFilename("Legend of Zelda, The (USA).nes");
    expect(result.title).toBe("The Legend of Zelda");
    expect(result.sortTitle).toBe("legend of zelda");
  });

  it("reads disc numbers in either spelling", () => {
    expect(parseFilename("Final Fantasy VII (Disc 1).chd").discNumber).toBe(1);
    expect(parseFilename("Some Game (Disk 2).chd").discNumber).toBe(2);
  });

  it("preserves parentheses that are part of the real title", () => {
    const result = parseFilename("Mega Man 2 (Special Edition) (Japan).nes");
    expect(result.title).toBe("Mega Man 2 (Special Edition)");
    expect(result.region).toBe("Japan");
  });

  it("treats underscores as separators only when there are no spaces", () => {
    expect(parseFilename("Donkey_Kong_Country.sfc").title).toBe(
      "Donkey Kong Country",
    );
    expect(parseFilename("Some Game_With Underscore.gba").title).toBe(
      "Some Game_With Underscore",
    );
  });

  it("captures translation tags without discarding them", () => {
    const result = parseFilename("Mother 3 (Japan) [T+Eng1.2].gba");
    expect(result.title).toBe("Mother 3");
    expect(result.statusTags).toEqual(["T+Eng1.2"]);
  });

  it("extracts a standalone year", () => {
    const result = parseFilename("Some Homebrew (2019).nes");
    expect(result.year).toBe(2019);
    expect(result.title).toBe("Some Homebrew");
  });

  it("does not mistake a version number for a year", () => {
    const result = parseFilename("Cool Demo (v1.2).nes");
    expect(result.year).toBeNull();
    expect(result.title).toBe("Cool Demo (v1.2)");
  });

  it("returns empty defaults when nothing is tagged", () => {
    const result = parseFilename("Tetris.gb");
    expect(result.region).toBeNull();
    expect(result.revision).toBeNull();
    expect(result.languages).toEqual([]);
    expect(result.discNumber).toBeNull();
    expect(result.statusTags).toEqual([]);
  });
});