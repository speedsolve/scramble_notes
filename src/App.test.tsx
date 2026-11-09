// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "fake-indexeddb/auto";
import { App } from "./main";
import { read, write, empty } from "./data";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("登録・編集・タグ再利用・AND/OR検索・チェック解除・アーカイブ・復元・削除", async () => {
  await write(empty());
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(
      (
        screen.getAllByRole("button", {
          name: "＋ スクランブル登録",
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  async function add(scramble: string, tags: string[]) {
    await user.click(
      screen.getAllByRole("button", { name: "＋ スクランブル登録" })[0],
    );
    await user.type(
      screen.getByPlaceholderText("R U R' U' F2 D L2 …"),
      scramble,
    );
    for (const tag of tags) {
      await user.type(
        screen.getByRole("textbox", { name: "タグ名" }),
        tag,
      );
      await user.keyboard("{Enter}");
    }
    await user.click(
      screen.getByRole("button", { name: "登録する" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  await add("R U", ["FB", "SB"]);
  await add("F2 D", ["FB"]);
  expect((await read()).tags).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "FB" }));
  await user.click(screen.getByRole("button", { name: "SB" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("タグ検索方法"), "OR");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  await user.selectOptions(screen.getByLabelText("タグ検索方法"), "AND");
  let card = screen.getByRole("article");
  await user.click(within(card).getByRole("checkbox"));
  await waitFor(async () =>
    expect(
      (await read()).entries.find((e) => e.scramble === "R U")?.checked,
    ).toBe(true),
  );
  await user.click(
    screen.getByRole("button", { name: "表示中をチェック解除" }),
  );
  await waitFor(async () =>
    expect((await read()).entries.some((e) => e.checked)).toBe(false),
  );
  await user.click(
    within(card).getByRole("button", { name: "編集" }),
  );
  await user.type(
    screen.getByPlaceholderText(
      "例：FBのペアが見つけにくい。Inspectionをもう一度。",
    ),
    "編集確認",
  );
  await user.click(screen.getByRole("button", { name: "変更を保存" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("編集確認")).toBeTruthy();
  await user.click(
    within(screen.getByRole("article")).getByRole("button", {
      name: "▣ アーカイブ",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
  await user.click(
    screen.getByRole("button", { name: "▣アーカイブ" }),
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(
    (await read()).entries.find((e) => e.scramble === "R U")?.archivedAt,
  ).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "↶ 練習に戻す" }));
  await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
  await user.click(screen.getByRole("button", { name: /タグ管理/ }));
  vi.spyOn(window, "prompt").mockReturnValue("First Block");
  await user.click(screen.getAllByRole("button", { name: "名前を変更" })[0]);
  await waitFor(() => expect(screen.getByText("First Block")).toBeTruthy());
  await user.click(
    screen.getAllByRole("button", { name: "削除" })[1],
  );
  await waitFor(async () => expect((await read()).tags).toHaveLength(1));
  expect((await read()).entries.every((e) => e.tagIds.length === 1)).toBe(true);
  await user.click(screen.getByRole("button", { name: /練習リスト/ }));
  for (const box of screen.getAllByRole("checkbox")) {
    await user.click(box);
    await waitFor(async () =>
      expect((await read()).entries.some((e) => e.checked)).toBe(true),
    );
  }
  await user.click(
    screen.getByRole("button", { name: "全チェック解除" }),
  );
  await waitFor(async () =>
    expect((await read()).entries.some((e) => e.checked)).toBe(false),
  );
  await user.click(
    screen.getAllByRole("button", { name: "削除" })[0],
  );
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect((await read()).entries).toHaveLength(1);
}, 20000);
it("ファイルプレビュー後のJSON全置換と不正インポートの保護", async () => {
  await write(empty());
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(
      (
        screen.getAllByRole("button", {
          name: "＋ スクランブル登録",
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: /バックアップ/ }));
  const input = document.querySelector("input[type=file]")!;
  const content = {
    version: 1,
    tags: [],
    entries: [
      {
        id: "restore",
        scramble: "R2 U2",
        memo: "復元テスト",
        tagIds: [],
        checked: true,
        archived: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        archivedAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
  fireEvent.change(input, {
    target: {
      files: [
        { name: "backup.json", text: async () => JSON.stringify(content) },
      ],
    },
  });
  await screen.findByText("プレビュー: 1件 / 0タグ");
  expect((await read()).entries).toHaveLength(0);
  await user.selectOptions(screen.getByLabelText("インポート方式"), "replace");
  await user.click(screen.getByRole("button", { name: "インポート実行" }));
  await waitFor(async () => expect(await read()).toEqual(content));
  fireEvent.change(input, {
    target: { files: [{ name: "bad.json", text: async () => "{" }] },
  });
  await screen.findByRole("alert");
  expect(await read()).toEqual(content);
  expect(screen.queryByRole("button", { name: "インポート実行" })).toBeNull();
});
