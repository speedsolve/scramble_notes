import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  empty,
  normalize,
  validScramble,
  validate,
  parseFile,
  toCSV,
  merge,
  read,
  write,
  type Data,
} from "./data";
const fixture = (): Data => ({
  version: 1,
  tags: [
    { id: "fb", name: "FB" },
    { id: "unused", name: "未使用" },
  ],
  entries: [
    {
      id: "a",
      scramble: "R U R' U'",
      memo: '日本語, "メモ"\n2行目',
      tagIds: ["fb"],
      checked: true,
      archived: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      archivedAt: "2026-02-01T00:00:00.000Z",
    },
  ],
});
describe("記法とバックアップ", () => {
  it("記法の正規化と検証", () => {
    expect(normalize(" R  U′\nF2 ")).toBe("R U' F2");
    expect(validScramble("R U2 F' B D L2")).toBe(true);
    for (const s of ["", "Rw", "M", "R3", "R U <script>"])
      expect(validScramble(s)).toBe(false);
  });
  it("JSON完全復元（未使用タグ・全状態・日時）", () =>
    expect(parseFile(JSON.stringify(fixture()), false)).toEqual(fixture()));
  it("BOM付きCSV完全復元（改行・カンマ・引用符・日本語）", () => {
    expect(toCSV(fixture()).charCodeAt(0)).toBe(0xfeff);
    expect(parseFile(toCSV(fixture()), true)).toEqual(fixture());
  });
  it("空データも両形式で復元", () => {
    expect(parseFile(toCSV(empty()), true)).toEqual(empty());
    expect(parseFile(JSON.stringify(empty()), false)).toEqual(empty());
  });
  it("不正データを拒否", () => {
    for (const change of [
      { checked: "false" },
      { tagIds: ["missing"] },
      { createdAt: "bad" },
      { archivedAt: null },
      { scramble: "R3" },
    ]) {
      const d = fixture();
      Object.assign(d.entries[0], change);
      expect(() => validate(d)).toThrow();
    }
    expect(() => parseFile("{", false)).toThrow();
    expect(() => validate({ ...fixture(), version: 2 })).toThrow();
  });
  it("CSVエラーに行番号", () => {
    expect(() =>
      parseFile(toCSV(fixture()).replace("\"R U R' U'\"", '"R3"'), true),
    ).toThrow("4行");
    expect(() =>
      parseFile(toCSV(fixture()).replace('"true"', '"yes"'), true),
    ).toThrow("4行");
  });
  it("重複をスキップまたは上書きし、ID衝突を解決", () => {
    const old = fixture(),
      incoming = fixture();
    incoming.entries[0].memo = "更新";
    expect(merge(old, incoming, false).entries[0].memo).toBe(
      old.entries[0].memo,
    );
    expect(merge(old, incoming, true).entries[0].memo).toBe("更新");
    incoming.entries[0].scramble = "F2";
    incoming.tags[0].name = "SB";
    const merged = merge(old, incoming, false);
    expect(merged.entries).toHaveLength(2);
    expect(new Set(merged.entries.map((e) => e.id)).size).toBe(2);
    expect(() => validate(merged)).not.toThrow();
    expect(old).toEqual(fixture());
  });
  it("ファイル内の重複を拒否", () => {
    const d = fixture();
    d.entries.push({ ...d.entries[0], id: "b" });
    expect(() => validate(d)).toThrow("重複");
  });
  it("IndexedDB保存、再読込、全置換", async () => {
    await write(fixture());
    expect(await read()).toEqual(fixture());
    await write(empty());
    expect(await read()).toEqual(empty());
  });
});
