import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type Data,
  type Entry,
  empty,
  read,
  write,
  normalize,
  validScramble,
  uid,
  toCSV,
  parseFile,
  merge,
} from "./data";
import "./style.css";
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("ja-JP") : "まだありません";
export function App() {
  const [data, setData] = useState<Data>(empty),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("practice"),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState<string[]>([]),
    [mode, setMode] = useState("AND"),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("new"),
    [seed, setSeed] = useState(Math.random()),
    [editor, setEditor] = useState(false),
    [editing, setEditing] = useState<Entry | null>(null),
    [scramble, setScramble] = useState(""),
    [memo, setMemo] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [tagText, setTagText] = useState(""),
    [pending, setPending] = useState<Data | null>(null),
    [importMode, setImportMode] = useState("add"),
    [duplicates, setDuplicates] = useState("skip"),
    [lastExport, setLastExport] = useState(localStorage.getItem("roux-export")),
    [theme, setTheme] = useState(localStorage.getItem("roux-theme") || "auto");
  const lock = useRef(false);
  useEffect(() => {
    read()
      .then((d) => {
        setData(d);
        setReady(true);
      })
      .catch(() =>
        setError(
          "保存領域を開けませんでした。ブラウザの保存設定をご確認ください。",
        ),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("roux-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 3500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function commit(d: Data) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await write(d);
      setData(d);
      return true;
    } catch {
      setError(
        "保存に失敗しました。空き容量をご確認ください。変更は反映していません。",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!editor) return;
    const previous = document.activeElement as HTMLElement | null;
    const handle = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".modal button:not(:disabled), .modal input:not(:disabled), .modal textarea:not(:disabled), .modal select:not(:disabled)",
        ),
      );
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [editor]);
  const active = data.entries.filter((e) => !e.archived),
    checked = active.filter((e) => e.checked).length;
  const visible = data.entries
    .filter(
      (e) =>
        e.archived === (page === "archive") &&
        (!query ||
          `${e.scramble} ${e.memo}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (status === "all" || e.checked === (status === "checked")) &&
        (!filters.length ||
          (mode === "AND"
            ? filters.every((t) => e.tagIds.includes(t))
            : filters.some((t) => e.tagIds.includes(t)))),
    )
    .sort((a, b) =>
      sort === "random"
        ? hash(a.id, seed) - hash(b.id, seed)
        : sort === "old"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  function openEditor(e?: Entry) {
    setEditing(e || null);
    setScramble(e?.scramble || "");
    setMemo(e?.memo || "");
    setSelected(
      e ? e.tagIds.map((id) => data.tags.find((t) => t.id === id)!.name) : [],
    );
    setTagText("");
    setError("");
    setEditor(true);
  }
  function addTag(name: string) {
    name = name.trim();
    if (name && !selected.includes(name)) setSelected([...selected, name]);
    setTagText("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const s = normalize(scramble);
    if (!validScramble(s)) {
      setError("U D L R F B と 2 / ' を使った記法で入力してください。");
      return;
    }
    if (
      data.entries.some(
        (x) => x.id !== editing?.id && normalize(x.scramble) === s,
      )
    ) {
      setError(
        "同じスクランブルが登録済みです。アーカイブも確認してください。",
      );
      return;
    }
    const d = structuredClone(data),
      names = [
        ...new Set([...selected, ...(tagText.trim() ? [tagText.trim()] : [])]),
      ],
      tagIds = names.map((name) => {
        let t = d.tags.find((t) => t.name === name);
        if (!t) {
          t = { id: uid(), name };
          d.tags.push(t);
        }
        return t.id;
      });
    const now = new Date().toISOString(),
      entry: Entry = {
        id: editing?.id || uid(),
        scramble: s,
        memo,
        tagIds,
        checked: editing?.checked || false,
        archived: editing?.archived || false,
        createdAt: editing?.createdAt || now,
        updatedAt: now,
        archivedAt: editing?.archivedAt || null,
      };
    d.entries = editing
      ? d.entries.map((x) => (x.id === entry.id ? entry : x))
      : [entry, ...d.entries];
    if (await commit(d)) {
      setEditor(false);
      setNotice(editing ? "更新しました" : "スクランブルを登録しました");
    }
  }
  async function patch(e: Entry, p: Partial<Entry>) {
    await commit({
      ...data,
      entries: data.entries.map((x) =>
        x.id === e.id ? { ...x, ...p, updatedAt: new Date().toISOString() } : x,
      ),
    });
  }
  async function reset(onlyVisible: boolean) {
    const ids = new Set(visible.map((e) => e.id));
    if (
      !confirm(
        onlyVisible
          ? "現在表示中のチェックをすべて解除しますか？"
          : "アーカイブを含む全スクランブルのチェックを解除しますか？",
      )
    )
      return;
    await commit({
      ...data,
      entries: data.entries.map((e) =>
        e.checked && (!onlyVisible || ids.has(e.id))
          ? { ...e, checked: false, updatedAt: new Date().toISOString() }
          : e,
      ),
    });
  }
  function download(csv: boolean) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([csv ? toCSV(data) : JSON.stringify(data, null, 2)], {
          type: csv ? "text/csv;charset=utf-8" : "application/json",
        }),
      );
    a.href = url;
    a.download = `scramble-notes-${new Date().toISOString().slice(0, 10)}.${csv ? "csv" : "json"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const now = new Date().toISOString();
    setLastExport(now);
    localStorage.setItem("roux-export", now);
    setNotice("バックアップの保存を開始しました");
  }
  async function loadFile(file?: File) {
    if (!file) return;
    setPending(null);
    try {
      setPending(
        parseFile(await file.text(), file.name.toLowerCase().endsWith(".csv")),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }
  async function importData() {
    if (!pending) return;
    if (
      importMode === "replace" &&
      !confirm(
        "既存の全スクランブル・タグを置き換えます。事前にバックアップしましたか？",
      )
    )
      return;
    if (
      await commit(
        importMode === "replace"
          ? pending
          : merge(data, pending, duplicates === "overwrite"),
      )
    ) {
      setPending(null);
      setFilters([]);
      setNotice("インポートしました");
    }
  }
  return (
    <div className="app">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("practice");
          }}
        >
          <span className="logo">▦</span> Scramble Notes
        </a>
        <div className="eyebrow">YOUR PRACTICE LIBRARY</div>
        <nav>
          {[
            ["practice", "▦", "練習リスト"],
            ["archive", "▣", "アーカイブ"],
            ["tags", "⌗", "タグ管理"],
            ["backup", "↗", "バックアップ"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "nav active" : "nav"}
              onClick={() => {
                setPage(id);
                setFilters([]);
                setQuery("");
                setStatus("all");
              }}
            >
              <span>{icon}</span>
              {label}
              {id === "practice" && <small>{active.length}</small>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="local-dot" /> このブラウザに保存
          <br />
          <small>ログイン不要・オフライン対応</small>
          <label className="theme">
            外観
            <select
              aria-label="外観"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="auto">端末に合わせる</option>
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </label>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">3 × 3 × 3 / SCRAMBLE PRACTICE</div>
            <h1>
              {
                {
                  practice: "苦手を、得意に。",
                  archive: "積み重ねた練習。",
                  tags: "練習を整理する。",
                  backup: "練習の記録を守る。",
                }[page]
              }
            </h1>
            <p>
              {
                {
                  practice: "気になるスクランブルを残して、もう一度。",
                  archive:
                    "習得したスクランブルはここに。いつでも練習に戻せます。",
                  tags: "自分に合った切り口で、スクランブルを分類。",
                  backup: "大切な記録を、定期的にファイルへ保存しましょう。",
                }[page]
              }
            </p>
          </div>
          <button
            className="primary"
            disabled={!ready || busy}
            onClick={() => openEditor()}
          >
            ＋ スクランブル登録
          </button>
        </header>
        {error && (
          <div role="alert" className="error">
            <pre>{error}</pre>
            <button onClick={() => setError("")}>閉じる</button>
          </div>
        )}
        {!ready ? (
          <p>データを読み込んでいます…</p>
        ) : (
          <fieldset disabled={busy} className="workspace">
            {(page === "practice" || page === "archive") && (
              <>
                <section className="stats">
                  <div>
                    <span>練習リスト</span>
                    <strong>
                      {active.length}
                      <small>件</small>
                    </strong>
                  </div>
                  <div>
                    <span>今回のチェック</span>
                    <strong>
                      {checked}
                      <small>/ {active.length}</small>
                    </strong>
                  </div>
                  <div>
                    <span>アーカイブ</span>
                    <strong>
                      {data.entries.length - active.length}
                      <small>件</small>
                    </strong>
                  </div>
                  <div className="progress-box">
                    <span>今回の練習</span>
                    <progress value={checked} max={active.length || 1} />
                    <small>チェックと習得は別に記録</small>
                  </div>
                </section>
                <section className="filters">
                  <div className="search-row">
                    <input
                      aria-label="スクランブルやメモを検索"
                      placeholder="⌕  スクランブルやメモを検索"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="チェック状態"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">すべてのチェック状態</option>
                      <option value="unchecked">未チェック</option>
                      <option value="checked">チェック済み</option>
                    </select>
                    <select
                      aria-label="並び順"
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setSeed(Math.random());
                      }}
                    >
                      <option value="new">登録が新しい順</option>
                      <option value="old">登録が古い順</option>
                      <option value="random">ランダム順</option>
                    </select>
                    {sort === "random" && (
                      <button onClick={() => setSeed(Math.random())}>
                        シャッフル
                      </button>
                    )}
                  </div>
                  <div className="tag-filter">
                    <span>タグで絞り込み</span>
                    {data.tags.map((t) => (
                      <button
                        key={t.id}
                        aria-pressed={filters.includes(t.id)}
                        className={
                          "chip " + (filters.includes(t.id) ? "selected" : "")
                        }
                        onClick={() =>
                          setFilters(
                            filters.includes(t.id)
                              ? filters.filter((x) => x !== t.id)
                              : [...filters, t.id],
                          )
                        }
                      >
                        {t.name}
                      </button>
                    ))}
                    {!data.tags.length && (
                      <small>登録時に自由にタグを追加できます</small>
                    )}
                    <select
                      aria-label="タグ検索方法"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option>AND</option>
                      <option>OR</option>
                    </select>
                    {filters.length > 0 && (
                      <button onClick={() => setFilters([])}>クリア</button>
                    )}
                  </div>
                </section>
                <div className="list-heading">
                  <span>
                    {page === "archive" ? "アーカイブ" : "スクランブル"}{" "}
                    <b>{visible.length}</b>
                    <small>
                      表示中のチェック {visible.filter((e) => e.checked).length}{" "}
                      / {visible.length}
                    </small>
                  </span>
                  <div>
                    <button onClick={() => reset(true)}>
                      表示中をチェック解除
                    </button>
                    <button onClick={() => reset(false)}>全チェック解除</button>
                  </div>
                </div>
                <div className="cards">
                  {visible.map((e) => (
                    <article
                      className={"card " + (e.checked ? "done" : "")}
                      key={e.id}
                    >
                      <div className="card-top">
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={e.checked}
                            onChange={() => patch(e, { checked: !e.checked })}
                          />
                          {e.checked ? "今回の練習済み" : "未チェック"}
                        </label>
                        <time>{date(e.createdAt)}</time>
                      </div>
                      <p className="scramble">{e.scramble}</p>
                      <div className="chips">
                        {e.tagIds.map((id) => (
                          <span className="chip" key={id}>
                            {data.tags.find((t) => t.id === id)?.name}
                          </span>
                        ))}
                      </div>
                      {e.memo && <p className="memo">{e.memo}</p>}
                      <footer>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(e.scramble);
                              setNotice("コピーしました");
                            } catch {
                              setError(
                                "コピーできませんでした。文字列を選択してコピーしてください。",
                              );
                            }
                          }}
                        >
                          ▤ コピー
                        </button>
                        <button onClick={() => openEditor(e)}>編集</button>
                        <button
                          onClick={() =>
                            patch(e, {
                              archived: !e.archived,
                              archivedAt: e.archived
                                ? null
                                : new Date().toISOString(),
                            })
                          }
                        >
                          {e.archived ? "↶ 練習に戻す" : "▣ アーカイブ"}
                        </button>
                        <button
                          className="delete"
                          onClick={async () => {
                            if (
                              confirm(
                                "このスクランブルを削除しますか？元に戻せません。",
                              )
                            )
                              await commit({
                                ...data,
                                entries: data.entries.filter(
                                  (x) => x.id !== e.id,
                                ),
                              });
                          }}
                        >
                          削除
                        </button>
                      </footer>
                      {e.archived && (
                        <small>アーカイブ: {date(e.archivedAt)}</small>
                      )}
                    </article>
                  ))}
                </div>
                {!visible.length && (
                  <div className="empty">
                    <div>▦</div>
                    <h2>
                      {data.entries.length
                        ? "該当するスクランブルはありません"
                        : "最初のスクランブルを残そう"}
                    </h2>
                    <p>
                      {data.entries.length
                        ? "検索条件を変更してみてください。"
                        : "FBが難しい、EOで迷った。そんな一問から始めましょう。"}
                    </p>
                    <button onClick={() => openEditor()}>
                      ＋ スクランブル登録
                    </button>
                  </div>
                )}
              </>
            )}
            {page === "tags" && (
              <section className="panel">
                <h2>
                  タグ一覧 <small>{data.tags.length}件</small>
                </h2>
                <p>名前の変更は、すべてのスクランブルに反映されます。</p>
                {data.tags.map((t) => (
                  <div className="tag-row" key={t.id}>
                    <span className="chip">{t.name}</span>
                    <span>
                      {
                        data.entries.filter((e) => e.tagIds.includes(t.id))
                          .length
                      }
                      件
                    </span>
                    <button
                      onClick={async () => {
                        const name = prompt("新しいタグ名", t.name)?.trim();
                        if (!name || name === t.name) return;
                        if (data.tags.some((x) => x.name === name)) {
                          setError("同じ名前のタグがあります");
                          return;
                        }
                        await commit({
                          ...data,
                          tags: data.tags.map((x) =>
                            x.id === t.id ? { ...x, name } : x,
                          ),
                        });
                      }}
                    >
                      名前を変更
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          confirm(
                            `「${t.name}」を削除し、全スクランブルから解除しますか？`,
                          )
                        )
                          await commit({
                            ...data,
                            tags: data.tags.filter((x) => x.id !== t.id),
                            entries: data.entries.map((e) => ({
                              ...e,
                              tagIds: e.tagIds.filter((id) => id !== t.id),
                            })),
                          });
                      }}
                    >
                      削除
                    </button>
                  </div>
                ))}
                {!data.tags.length && (
                  <p>スクランブル登録フォームでタグを追加できます。</p>
                )}
              </section>
            )}
            {page === "backup" && (
              <>
                <section className="panel">
                  <h2>エクスポート</h2>
                  <label>
                    外観{" "}
                    <select
                      aria-label="バックアップ画面の外観"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="auto">端末に合わせる</option>
                      <option value="light">ライト</option>
                      <option value="dark">ダーク</option>
                    </select>
                  </label>
                  <p>
                    全{data.entries.length}件・{data.tags.length}
                    タグ（アーカイブを含む）
                  </p>
                  <div className="actions">
                    <button className="primary" onClick={() => download(false)}>
                      ↓ JSON 完全バックアップ
                    </button>
                    <button onClick={() => download(true)}>↓ CSV 保存</button>
                  </div>
                  <p>最終エクスポート: {date(lastExport)}</p>
                  <div className="hint">
                    データはこの端末のブラウザ内だけに保存されます。ブラウザのデータ削除で失われるため、定期的なJSONバックアップをおすすめします。ダウンロードしたファイルが保存されたこともご確認ください。
                  </div>
                </section>
                <section className="panel">
                  <h2>インポート</h2>
                  <label
                    className="drop"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      loadFile(e.dataTransfer.files[0]);
                    }}
                  >
                    ↑ JSON / CSVをドロップ、またはファイルを選択
                    <input
                      type="file"
                      accept=".json,.csv"
                      onChange={(e) => {
                        loadFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {pending && (
                    <div>
                      <h3>
                        プレビュー: {pending.entries.length}件 /{" "}
                        {pending.tags.length}タグ
                      </h3>
                      <p>
                        アーカイブ{" "}
                        {pending.entries.filter((e) => e.archived).length}
                        件・チェック済み{" "}
                        {pending.entries.filter((e) => e.checked).length}
                        件・既存と重複{" "}
                        {
                          pending.entries.filter((e) =>
                            data.entries.some(
                              (x) => normalize(x.scramble) === e.scramble,
                            ),
                          ).length
                        }
                        件
                      </p>
                      <div className="preview">
                        {pending.entries.map((e, i) => (
                          <div key={e.id}>
                            <b>
                              {i + 1}. {e.scramble}
                            </b>
                            <p>
                              {e.memo || "メモなし"} /{" "}
                              {e.tagIds
                                .map(
                                  (id) =>
                                    pending.tags.find((t) => t.id === id)?.name,
                                )
                                .join(", ")}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="actions">
                        <select
                          aria-label="インポート方式"
                          value={importMode}
                          onChange={(e) => setImportMode(e.target.value)}
                        >
                          <option value="add">既存に追加</option>
                          <option value="replace">全置き換え</option>
                        </select>
                        {importMode === "add" && (
                          <select
                            aria-label="重複の処理"
                            value={duplicates}
                            onChange={(e) => setDuplicates(e.target.value)}
                          >
                            <option value="skip">重複をスキップ</option>
                            <option value="overwrite">重複を上書き</option>
                          </select>
                        )}
                        <button className="primary" onClick={importData}>
                          インポート実行
                        </button>
                        <button onClick={() => setPending(null)}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </fieldset>
        )}
        <div className="bottom-note">
          SCRAMBLE NOTES <span>一問ずつ、確かな手応えに。</span>
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
        </div>
      )}
      {editor && (
        <div
          className="overlay"
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              !busy &&
              confirm("入力を破棄して閉じますか？")
            )
              setEditor(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
            onKeyDown={(e) => {
              if (
                e.key === "Escape" &&
                !busy &&
                confirm("入力を破棄して閉じますか？")
              )
                setEditor(false);
            }}
          >
            <h2 id="editor-title">
              {editing ? "スクランブルを編集" : "スクランブルを登録"}
            </h2>
            {error && (
              <div className="error" role="alert">
                {error}
                <button onClick={() => setError("")}>閉じる</button>
              </div>
            )}
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <label>
                  スクランブル <span className="required">必須</span>
                  <textarea
                    autoFocus
                    className="scramble-input"
                    required
                    rows={3}
                    placeholder="R U R' U' F2 D L2 …"
                    value={scramble}
                    onChange={(e) => setScramble(e.target.value)}
                  />
                </label>
                <small>WCA 3×3×3記法 / U D L R F B と 2・′</small>
                <div className="tag-field">
                  <label htmlFor="tag-name">タグ</label>
                  <div className="tag-input">
                    {selected.map((name) => (
                      <button
                        type="button"
                        className="chip selected"
                        key={name}
                        onClick={() =>
                          setSelected(selected.filter((x) => x !== name))
                        }
                      >
                        {name} <span aria-label={`${name}を解除`}>×</span>
                      </button>
                    ))}
                    <input
                      id="tag-name"
                      aria-label="タグ名"
                      placeholder="タグを入力・選択"
                      value={tagText}
                      onChange={(e) => setTagText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          addTag(tagText);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="suggestions">
                  {data.tags
                    .filter(
                      (t) =>
                        !selected.includes(t.name) &&
                        t.name.toLowerCase().includes(tagText.toLowerCase()),
                    )
                    .map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => addTag(t.name)}
                      >
                        {t.name}
                      </button>
                    ))}
                  {tagText.trim() &&
                    !data.tags.some((t) => t.name === tagText.trim()) && (
                      <button type="button" onClick={() => addTag(tagText)}>
                        ＋「{tagText.trim()}」を作成
                      </button>
                    )}
                </div>
                <label>
                  メモ <small>任意</small>
                  <textarea
                    placeholder="例：FBのペアが見つけにくい。Inspectionをもう一度。"
                    rows={3}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("入力を破棄して閉じますか？"))
                        setEditor(false);
                    }}
                  >
                    キャンセル
                  </button>
                  <button className="primary" type="submit">
                    {busy ? "保存中…" : editing ? "変更を保存" : "登録する"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function hash(s: string, seed: number) {
  let h = Math.floor(seed * 2147483647);
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
