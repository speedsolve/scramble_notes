export type Tag = { id: string; name: string };
export type Entry = {
  id: string;
  scramble: string;
  memo: string;
  tagIds: string[];
  checked: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};
export type Data = { version: 1; tags: Tag[]; entries: Entry[] };
export const empty = (): Data => ({ version: 1, tags: [], entries: [] });
export const normalize = (s: string) =>
  s.trim().replace(/[’′]/g, "'").replace(/\s+/g, " ");
export const validScramble = (s: string) =>
  /^[URFDLB](?:2|')?(?: [URFDLB](?:2|')?)*$/.test(normalize(s));
export const uid = () => crypto.randomUUID();
export async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("roux-notes", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function read(): Promise<Data> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state");
    const r = tx.objectStore("state").get("data");
    r.onsuccess = () => resolve(r.result ?? empty());
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function write(data: Data) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(data, "data");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => reject(tx.error);
  });
}
const columns = [
  "type",
  "id",
  "scramble",
  "memo",
  "tagIds",
  "checked",
  "archived",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "tagName",
];
const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
export function toCSV(d: Data) {
  return (
    "\uFEFF" +
    [
      columns,
      ...d.tags.map((t) => [
        "tag",
        t.id,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        t.name,
      ]),
      ...d.entries.map((e) => [
        "entry",
        e.id,
        e.scramble,
        e.memo,
        JSON.stringify(e.tagIds),
        e.checked,
        e.archived,
        e.createdAt,
        e.updatedAt,
        e.archivedAt,
        "",
      ]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
export function csvRows(text: string): { cells: string[]; line: number }[] {
  text = text.replace(/^\uFEFF/, "");
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    value = "",
    quoted = false,
    line = 1,
    start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        if (text[i + 1] && !/[\r\n,]/.test(text[i + 1]))
          throw Error(`${line}行: 引用符の後に不正な文字`);
      } else if (value === "") quoted = true;
      else throw Error(`${line}行: 不正な引用符`);
    } else if (c === "," && !quoted) {
      cells.push(value);
      value = "";
    } else if (c === "\n" && !quoted) {
      cells.push(value.replace(/\r$/, ""));
      rows.push({ cells, line: start });
      cells = [];
      value = "";
      line++;
      start = line;
    } else {
      value += c;
      if (c === "\n") line++;
    }
  }
  if (quoted) throw Error(`${start}行: 引用符が閉じていません`);
  if (value || cells.length) {
    cells.push(value.replace(/\r$/, ""));
    rows.push({ cells, line: start });
  }
  return rows;
}
export function validate(input: unknown, lines?: number[]): Data {
  const d = input as Data;
  const errors: string[] = [];
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.tags) ||
    !Array.isArray(d.entries)
  )
    throw Error("データ形式またはバージョンが不正です（version: 1 が必要）");
  const ids = new Set<string>(),
    names = new Set<string>();
  d.tags.forEach((t, i) => {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      ids.has(t.id) ||
      names.has(t.name.trim())
    )
      errors.push(`タグ ${i + 1}: 名前・IDが不正、または重複`);
    else {
      ids.add(t.id);
      names.add(t.name.trim());
    }
  });
  const entryIds = new Set<string>(),
    scrambles = new Set<string>();
  d.entries.forEach((e, i) => {
    const prefix = lines ? `${lines[i]}行` : `entries[${i}]`;
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      entryIds.has(e.id) ||
      typeof e.scramble !== "string" ||
      !validScramble(e.scramble) ||
      typeof e.memo !== "string" ||
      !Array.isArray(e.tagIds) ||
      e.tagIds.some((t) => !ids.has(t)) ||
      new Set(e.tagIds).size !== e.tagIds.length ||
      typeof e.checked !== "boolean" ||
      typeof e.archived !== "boolean" ||
      ![e.createdAt, e.updatedAt].every(
        (x) => typeof x === "string" && Number.isFinite(Date.parse(x)),
      ) ||
      !(e.archived
        ? typeof e.archivedAt === "string" &&
          Number.isFinite(Date.parse(e.archivedAt))
        : e.archivedAt === null)
    )
      errors.push(`${prefix}: 必須項目・記法・タグ参照・日時・状態が不正です`);
    else {
      entryIds.add(e.id);
      const s = normalize(e.scramble);
      if (scrambles.has(s))
        errors.push(`${prefix}: ファイル内でスクランブルが重複しています`);
      scrambles.add(s);
    }
  });
  if (errors.length) throw Error(errors.join("\n"));
  return {
    version: 1,
    tags: d.tags.map((t) => ({ ...t, name: t.name.trim() })),
    entries: d.entries.map((e) => ({ ...e, scramble: normalize(e.scramble) })),
  };
}
export function parseFile(text: string, csv: boolean): Data {
  if (!csv) return validate(JSON.parse(text.replace(/^\uFEFF/, "")));
  const rows = csvRows(text),
    header = rows.shift();
  if (!header || header.cells.join(",") !== columns.join(","))
    throw Error("1行: CSVヘッダーが仕様と一致しません");
  const d = empty(),
    lines: number[] = [];
  for (const { cells: c, line } of rows) {
    if (c.every((x) => !x)) continue;
    if (c.length !== columns.length) throw Error(`${line}行: 列数が不正です`);
    if (c[0] === "tag") {
      if (
        !c[1] ||
        !c[10].trim() ||
        d.tags.some((t) => t.id === c[1] || t.name === c[10].trim())
      )
        throw Error(`${line}行: タグの名前・IDが不正または重複`);
      d.tags.push({ id: c[1], name: c[10] });
    } else if (c[0] === "entry") {
      if (
        !["true", "false"].includes(c[5]) ||
        !["true", "false"].includes(c[6])
      )
        throw Error(`${line}行: 状態はtrue/falseで指定してください`);
      let tags;
      try {
        tags = JSON.parse(c[4]);
      } catch {
        throw Error(`${line}行: tagIdsのJSONが不正です`);
      }
      d.entries.push({
        id: c[1],
        scramble: c[2],
        memo: c[3],
        tagIds: tags,
        checked: c[5] === "true",
        archived: c[6] === "true",
        createdAt: c[7],
        updatedAt: c[8],
        archivedAt: c[9] || null,
      });
      lines.push(line);
    } else throw Error(`${line}行: typeが不正です`);
  }
  return validate(d, lines);
}
export function merge(current: Data, incoming: Data, overwrite: boolean): Data {
  const out = structuredClone(current),
    map = new Map<string, string>();
  for (const tag of incoming.tags) {
    const found = out.tags.find((t) => t.name === tag.name);
    const id =
      found?.id ?? (out.tags.some((t) => t.id === tag.id) ? uid() : tag.id);
    if (!found) out.tags.push({ ...tag, id });
    map.set(tag.id, id);
  }
  for (const entry of incoming.entries) {
    const index = out.entries.findIndex(
      (e) => normalize(e.scramble) === normalize(entry.scramble),
    );
    const e = { ...entry, tagIds: entry.tagIds.map((t) => map.get(t)!) };
    if (index >= 0) {
      if (overwrite) out.entries[index] = { ...e, id: out.entries[index].id };
    } else
      out.entries.push({
        ...e,
        id: out.entries.some((x) => x.id === e.id) ? uid() : e.id,
      });
  }
  return out;
}
