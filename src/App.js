import { useState, useEffect, useMemo } from "react";

// ── Constants ──────────────────────────────────────────────
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const PRACTICE_DAYS = new Set([0, 2, 4, 5]); // Sun=0,Tue=2,Thu=4,Fri=5

const STATUS = {
  present: {
    label: "出席",
    short: "○",
    color: "#22c55e",
    bg: "#f0fdf4",
    border: "#86efac",
  },
  absent: {
    label: "欠席",
    short: "×",
    color: "#ef4444",
    bg: "#fef2f2",
    border: "#fca5a5",
  },
  late: {
    label: "遅刻",
    short: "△",
    color: "#f59e0b",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  none: {
    label: "未記録",
    short: "－",
    color: "#94a3b8",
    bg: "#f8fafc",
    border: "#e2e8f0",
  },
};

const ROLES = ["未設定", "部長", "副部長", "会計", "マネージャー", "一般部員"];
const GRADES = ["未設定", "1年", "2年", "3年", "4年", "卒業生", "顧問"];

const INITIAL_MEMBERS = [
  { id: 1, name: "田中 太郎", grade: "2年", role: "部長", note: "" },
  { id: 2, name: "鈴木 花子", grade: "1年", role: "一般部員", note: "" },
  { id: 3, name: "佐藤 健", grade: "3年", role: "副部長", note: "" },
  { id: 4, name: "山田 美咲", grade: "2年", role: "マネージャー", note: "" },
  { id: 5, name: "伊藤 翔", grade: "1年", role: "一般部員", note: "" },
];

// ── Helpers ────────────────────────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() {
  return toDateStr(new Date());
}
function fmtDate(s) {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}（${DAYS[d.getDay()]}）`;
}

function getPracticeDates(fromDate, months = 1) {
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (PRACTICE_DAYS.has(cur.getDay())) dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function nextPracticeDate() {
  const cur = new Date();
  cur.setDate(cur.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (PRACTICE_DAYS.has(cur.getDay())) return toDateStr(cur);
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

function daysUntil(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr() + "T00:00:00");
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
}

function exportCSV(members, records) {
  const dates = Object.keys(records).sort();
  const header = ["名前", "学年", "役職", ...dates].join(",");
  const rows = members.map((m) => {
    const cells = [
      m.name,
      m.grade,
      m.role,
      ...dates.map(
        (d) => STATUS[records[d]?.[m.id]?.status || "none"]?.short || "－"
      ),
    ];
    return cells.map((c) => `"${c}"`).join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "出席記録.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Database Mock (Future Backend Integration Point) ───────
const DB = {
  load: (key, def) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? def;
    } catch {
      return def;
    }
  },
  save: (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
};

// ── Styled helpers ─────────────────────────────────────────
const btn = (bg = "#3b82f6", color = "#fff", extra = {}) => ({
  padding: "9px 18px",
  background: bg,
  color,
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  ...extra,
});

// ── Main App ───────────────────────────────────────────────
export default function App() {
  // State
  const [dark, setDark] = useState(() => DB.load("dark", false));
  const [members, setMembers] = useState(() =>
    DB.load("members", INITIAL_MEMBERS)
  );
  const [records, setRecords] = useState(() => DB.load("records", {}));
  const [selfReports, setSelfReports] = useState(() =>
    DB.load("selfReports", {})
  );
  const [notices, setNotices] = useState(() => DB.load("notices", []));
  const [practiceMemos, setPracticeMemos] = useState(() =>
    DB.load("practiceMemos", {})
  );

  // 新機能: 目安箱（Suggestions）のState
  const [suggestions, setSuggestions] = useState(() =>
    DB.load("suggestions", [])
  );

  const [view, setView] = useState("home");
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // Search & Filters (For large groups)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGrade, setFilterGrade] = useState("すべて");
  const [filterRole, setFilterRole] = useState("すべて");

  // Self-report state
  const [srStep, setSrStep] = useState(1);
  const [srMemberId, setSrMemberId] = useState("");
  const [srDraft, setSrDraft] = useState({});
  const [srSaved, setSrSaved] = useState(false);
  const [openDetail, setOpenDetail] = useState(null);

  // Suggestion Box State
  const [newSuggestion, setNewSuggestion] = useState("");
  const [suggestionSent, setSuggestionSent] = useState(false);

  // Modals / Edits
  const [editingMember, setEditingMember] = useState(null);
  const [newMember, setNewMember] = useState({
    name: "",
    grade: "1年",
    role: "一般部員",
    note: "",
  });
  const [showAddMember, setShowAddMember] = useState(false);
  const [newNotice, setNewNotice] = useState({
    title: "",
    body: "",
    important: false,
  });
  const [showAddNotice, setShowAddNotice] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [editingMemo, setEditingMemo] = useState(false);
  const [historyMemberId, setHistoryMemberId] = useState("all");

  const practiceDates = useMemo(() => getPracticeDates(todayStr()), []);
  const allDates = useMemo(
    () => Object.keys(records).sort().reverse(),
    [records]
  );

  // Persist data
  useEffect(() => {
    DB.save("dark", dark);
  }, [dark]);
  useEffect(() => {
    DB.save("members", members);
  }, [members]);
  useEffect(() => {
    DB.save("records", records);
  }, [records]);
  useEffect(() => {
    DB.save("selfReports", selfReports);
  }, [selfReports]);
  useEffect(() => {
    DB.save("notices", notices);
  }, [notices]);
  useEffect(() => {
    DB.save("practiceMemos", practiceMemos);
  }, [practiceMemos]);
  useEffect(() => {
    DB.save("suggestions", suggestions);
  }, [suggestions]); // 目安箱データの保存

  // Theme configuration
  const theme = dark
    ? {
        bg: "#0f172a",
        cardBg: "#1e293b",
        border: "#334155",
        text: "#f1f5f9",
        sub: "#94a3b8",
        navBg: "#1e293b",
        headerBg: "#0f172a",
        inputBg: "#0f172a",
        inputBorder: "#334155",
      }
    : {
        bg: "#f1f5f9",
        cardBg: "#fff",
        border: "#e2e8f0",
        text: "#1e293b",
        sub: "#64748b",
        navBg: "#fff",
        headerBg: "#1e293b",
        inputBg: "#fff",
        inputBorder: "#e2e8f0",
      };

  const tc = (extra = {}) => ({
    background: theme.cardBg,
    borderRadius: 12,
    padding: "14px 16px",
    boxShadow: "0 1px 4px #0001",
    ...extra,
  });
  const ti = (extra = {}) => ({
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    background: theme.inputBg,
    color: theme.text,
    width: "100%",
    boxSizing: "border-box",
    ...extra,
  });

  // ── Optimization: Batch calculate stats for all members ──
  const memberStats = useMemo(() => {
    const stats = {};
    const totalDays = allDates.length;

    members.forEach((m) => {
      let streak = 0;
      let presentCount = 0;
      let streakActive = true;

      for (const d of allDates) {
        const s = records[d]?.[m.id]?.status;
        if (s === "present") {
          presentCount++;
          if (streakActive) streak++;
        } else if (s) {
          streakActive = false; // streak breaks if absent or late
        }
      }
      stats[m.id] = {
        rate: totalDays ? Math.round((presentCount / totalDays) * 100) : 0,
        streak: streak,
      };
    });
    return stats;
  }, [members, records, allDates]);

  // ── Derived State: Filtered Members ──
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchSearch = m.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchGrade = filterGrade === "すべて" || m.grade === filterGrade;
      const matchRole = filterRole === "すべて" || m.role === filterRole;
      return matchSearch && matchGrade && matchRole;
    });
  }, [members, searchQuery, filterGrade, filterRole]);

  // Record helpers
  const getRecord = (mid, date = selectedDate) => records[date]?.[mid] || {};
  const getStatus = (mid, date = selectedDate) =>
    getRecord(mid, date).status || "none";
  const getSR = (mid, date = selectedDate) => selfReports[date]?.[mid];

  const setStatusAdmin = (mid, status) => {
    setRecords((r) => ({
      ...r,
      [selectedDate]: {
        ...(r[selectedDate] || {}),
        [mid]: { ...(r[selectedDate]?.[mid] || {}), status },
      },
    }));
  };
  const allPresentFiltered = () =>
    filteredMembers.forEach((m) => setStatusAdmin(m.id, "present"));
  const clearDay = () => {
    if (!confirm("この日の記録をリセットしますか？")) return;
    setRecords((r) => {
      const n = { ...r };
      delete n[selectedDate];
      return n;
    });
  };
  const applyReport = (mid) => {
    const sr = getSR(mid);
    if (!sr) return;
    setRecords((r) => ({
      ...r,
      [selectedDate]: {
        ...(r[selectedDate] || {}),
        [mid]: {
          status: sr.status,
          reason: sr.reason,
          arrivalTime: sr.arrivalTime,
        },
      },
    }));
  };

  // Self-report logic
  const startDraft = (mid) => {
    const draft = {};
    practiceDates.forEach((d) => {
      draft[d] = selfReports[d]?.[mid]
        ? { ...selfReports[d][mid] }
        : { status: "", reason: "", arrivalTime: "" };
    });
    setSrDraft(draft);
    setSrMemberId(mid);
    setSrStep(2);
    setSrSaved(false);
    setOpenDetail(null);
  };
  const setDraftStatus = (date, status) => {
    setSrDraft((d) => ({
      ...d,
      [date]: {
        ...(d[date] || {}),
        status,
        reason: d[date]?.reason || "",
        arrivalTime: d[date]?.arrivalTime || "",
      },
    }));
    if (status === "present") setOpenDetail(null);
  };
  const setDraftField = (date, field, val) => {
    setSrDraft((d) => ({ ...d, [date]: { ...(d[date] || {}), [field]: val } }));
  };
  const submitSelfReport = () => {
    const updates = {};
    practiceDates.forEach((date) => {
      const e = srDraft[date];
      if (e?.status)
        updates[date] = {
          ...(selfReports[date] || {}),
          [srMemberId]: { ...e, submittedAt: new Date().toISOString() },
        };
    });
    setSelfReports((r) => {
      const n = { ...r };
      Object.entries(updates).forEach(([d, v]) => (n[d] = v));
      return n;
    });
    setSrSaved(true);
  };
  const resetSelf = () => {
    setSrStep(1);
    setSrMemberId("");
    setSrDraft({});
    setSrSaved(false);
    setOpenDetail(null);
  };

  // Member management
  const addMember = () => {
    if (!newMember.name.trim()) return;
    setMembers((m) => [
      ...m,
      { ...newMember, id: Date.now(), name: newMember.name.trim() },
    ]);
    setNewMember({ name: "", grade: "1年", role: "一般部員", note: "" });
    setShowAddMember(false);
  };
  const removeMember = (id) => {
    if (!confirm("削除しますか？")) return;
    setMembers((m) => m.filter((x) => x.id !== id));
  };
  const updateMemberField = (id, field, val) => {
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, [field]: val } : x)));
  };

  // Notice management
  const addNotice = () => {
    if (!newNotice.title.trim()) return;
    setNotices((n) => [
      { ...newNotice, id: Date.now(), createdAt: new Date().toISOString() },
      ...n,
    ]);
    setNewNotice({ title: "", body: "", important: false });
    setShowAddNotice(false);
  };
  const removeNotice = (id) => setNotices((n) => n.filter((x) => x.id !== id));

  // Suggestion Box management
  const submitSuggestion = () => {
    if (!newSuggestion.trim()) return;
    setSuggestions((s) => [
      {
        id: Date.now(),
        text: newSuggestion,
        createdAt: new Date().toISOString(),
      },
      ...s,
    ]);
    setNewSuggestion("");
    setSuggestionSent(true);
    setTimeout(() => setSuggestionSent(false), 3000); // 3秒後に成功メッセージを消す
  };
  const removeSuggestion = (id) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    setSuggestions((s) => s.filter((x) => x.id !== id));
  };

  // Today summary
  const todaySummary = useMemo(
    () => ({
      present: members.filter(
        (m) => getStatus(m.id, selectedDate) === "present"
      ).length,
      absent: members.filter((m) => getStatus(m.id, selectedDate) === "absent")
        .length,
      late: members.filter((m) => getStatus(m.id, selectedDate) === "late")
        .length,
      none: members.filter((m) => getStatus(m.id, selectedDate) === "none")
        .length,
    }),
    [members, records, selectedDate]
  );

  const filledCount = practiceDates.filter((d) => srDraft[d]?.status).length;
  const srMemberName = members.find((m) => m.id === srMemberId)?.name || "";
  const nextDate = nextPracticeDate();
  const isPracticeDay = PRACTICE_DAYS.has(new Date().getDay());

  // Filter UI Component
  const FilterControls = () => (
    <div
      style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
    >
      <input
        placeholder="名前で検索..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ ...ti(), flex: "1 1 120px", padding: "6px 10px" }}
      />
      <select
        value={filterGrade}
        onChange={(e) => setFilterGrade(e.target.value)}
        style={{ ...ti(), flex: "0 1 100px", padding: "6px" }}
      >
        <option value="すべて">全学年</option>
        {GRADES.filter((g) => g !== "未設定").map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <select
        value={filterRole}
        onChange={(e) => setFilterRole(e.target.value)}
        style={{ ...ti(), flex: "0 1 100px", padding: "6px" }}
      >
        <option value="すべて">全役職</option>
        {ROLES.filter((r) => r !== "未設定").map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );

  const nav = [
    ["home", "🏠 ホーム"],
    ["report", "✏️ 事前申告"],
    ["admin", "📋 出席"],
    ["history", "📊 履歴"],
    ["notice", "📢 掲示板"],
    ["suggestion", "📮 目安箱"], // 新機能を追加
    ["members", "👥 メンバー"],
  ];

  return (
    <div
      style={{
        fontFamily: "'Hiragino Sans','Meiryo',sans-serif",
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        transition: "background .2s,color .2s",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#1e293b",
          color: "#fff",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
            部活出席管理
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {members.length}名 · 定期練習
          </div>
        </div>
        <button
          onClick={() => setDark((d) => !d)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            color: "#fff",
          }}
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </div>

      {/* Nav */}
      <div
        style={{
          display: "flex",
          background: theme.navBg,
          borderBottom: `1px solid ${theme.border}`,
          overflowX: "auto",
        }}
      >
        {nav.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              flex: "0 0 auto",
              minWidth: 70,
              padding: "10px 10px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: view === key ? 700 : 400,
              color: view === key ? "#3b82f6" : theme.sub,
              borderBottom:
                view === key ? "2px solid #3b82f6" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: 14,
          maxWidth: 620,
          margin: "0 auto",
          paddingBottom: 40,
        }}
      >
        {/* ══ HOME ══ */}
        {view === "home" && (
          <>
            {nextDate && (
              <div
                style={{
                  ...tc(),
                  marginBottom: 12,
                  background: dark ? "#1e3a5f" : "#eff6ff",
                  border: "1px solid #bfdbfe",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ fontSize: 36 }}>⏰</div>
                <div>
                  <div
                    style={{ fontSize: 12, color: "#3b82f6", fontWeight: 600 }}
                  >
                    次回練習
                  </div>
                  <div
                    style={{ fontSize: 16, fontWeight: 700, color: theme.text }}
                  >
                    {fmtDate(nextDate)}
                  </div>
                  <div style={{ fontSize: 13, color: "#3b82f6" }}>
                    あと {daysUntil(nextDate)} 日
                  </div>
                </div>
                {isPracticeDay && (
                  <div
                    style={{
                      marginLeft: "auto",
                      background: "#22c55e",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    今日は練習日！
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: theme.sub,
                marginBottom: 8,
              }}
            >
              今日の状況 — {fmtDate(todayStr())}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                ["present", "出席"],
                ["late", "遅刻"],
                ["absent", "欠席"],
                ["none", "未記録"],
              ].map(([s, l]) => (
                <div
                  key={s}
                  style={{
                    flex: 1,
                    background: dark ? theme.cardBg : STATUS[s].bg,
                    border: `1px solid ${STATUS[s].border}`,
                    borderRadius: 10,
                    padding: "10px 4px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: STATUS[s].color,
                    }}
                  >
                    {todaySummary[s]}
                  </div>
                  <div style={{ fontSize: 10, color: STATUS[s].color }}>
                    {l}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...tc(), marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                🏆 出席率ランキング
              </div>
              {[...members]
                .sort((a, b) => memberStats[b.id].rate - memberStats[a.id].rate)
                .slice(0, 5)
                .map((m, i) => {
                  const { rate, streak } = memberStats[m.id];
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{ fontSize: 16, width: 24, textAlign: "center" }}
                      >
                        {["🥇", "🥈", "🥉", "4", "5"][i]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {m.name}
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: theme.border,
                            borderRadius: 99,
                            overflow: "hidden",
                            marginTop: 3,
                          }}
                        >
                          <div
                            style={{
                              width: `${rate}%`,
                              height: "100%",
                              background:
                                rate >= 80
                                  ? "#22c55e"
                                  : rate >= 50
                                  ? "#f59e0b"
                                  : "#ef4444",
                              borderRadius: 99,
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color:
                            rate >= 80
                              ? "#22c55e"
                              : rate >= 50
                              ? "#f59e0b"
                              : "#ef4444",
                          minWidth: 36,
                        }}
                      >
                        {rate}%
                      </div>
                      {streak > 2 && (
                        <div style={{ fontSize: 11, color: "#f59e0b" }}>
                          🔥{streak}
                        </div>
                      )}
                    </div>
                  );
                })}
              {!allDates.length && (
                <div
                  style={{
                    fontSize: 13,
                    color: theme.sub,
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  まだ記録がありません
                </div>
              )}
            </div>

            {notices.length > 0 && (
              <div style={{ ...tc(), marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    📢 最新のお知らせ
                  </div>
                  <button
                    onClick={() => setView("notice")}
                    style={{
                      fontSize: 12,
                      color: "#3b82f6",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    全て見る
                  </button>
                </div>
                {notices.slice(0, 2).map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "8px 10px",
                      background: n.important
                        ? dark
                          ? "#450a0a"
                          : "#fef2f2"
                        : theme.bg,
                      borderRadius: 8,
                      marginBottom: 6,
                      borderLeft: `3px solid ${
                        n.important ? "#ef4444" : "#3b82f6"
                      }`,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {n.important ? "🚨 " : ""}
                      {n.title}
                    </div>
                    {n.body && (
                      <div
                        style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}
                      >
                        {n.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ SELF REPORT ══ */}
        {view === "report" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {[
                ["1", "名前"],
                ["2", "出欠入力"],
              ].map(([n, lbl], i) => (
                <div
                  key={n}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      background:
                        srStep >= Number(n) ? "#3b82f6" : theme.border,
                      color: srStep >= Number(n) ? "#fff" : theme.sub,
                    }}
                  >
                    {n}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: srStep >= Number(n) ? theme.text : theme.sub,
                      fontWeight: srStep >= Number(n) ? 600 : 400,
                    }}
                  >
                    {lbl}
                  </span>
                  {i === 0 && (
                    <div
                      style={{
                        width: 20,
                        height: 2,
                        background: srStep >= 2 ? "#3b82f6" : theme.border,
                        margin: "0 2px",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {srStep === 1 && (
              <>
                <FilterControls />
                <div
                  style={{ fontSize: 13, color: theme.sub, marginBottom: 10 }}
                >
                  名前を選んでください（全{filteredMembers.length}名）
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {filteredMembers.map((m) => {
                    const cnt = practiceDates.filter(
                      (d) => selfReports[d]?.[m.id]?.status
                    ).length;
                    return (
                      <button
                        key={m.id}
                        onClick={() => startDraft(m.id)}
                        style={{
                          padding: "13px 16px",
                          background: theme.cardBg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                          color: theme.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div>{m.name}</div>
                          <div
                            style={{
                              fontSize: 11,
                              color: theme.sub,
                              marginTop: 2,
                            }}
                          >
                            {m.grade} · {m.role}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: cnt > 0 ? "#22c55e" : theme.sub,
                          }}
                        >
                          {cnt > 0 ? `${cnt}件申告済` : "未申告"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {srStep === 2 && !srSaved && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <button
                    onClick={resetSelf}
                    style={{
                      ...btn(theme.border, theme.sub, {
                        padding: "5px 10px",
                        fontSize: 12,
                      }),
                    }}
                  >
                    ← 戻る
                  </button>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {srMemberName}
                  </div>
                  <div
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: theme.sub,
                    }}
                  >
                    {filledCount}/{practiceDates.length}件
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {practiceDates.map((date) => {
                    const entry = srDraft[date] || {};
                    const s = entry.status || "none";
                    const isOpen = openDetail === date;
                    return (
                      <div
                        key={date}
                        style={{
                          background: theme.cardBg,
                          borderRadius: 10,
                          overflow: "hidden",
                          border: `1px solid ${
                            s !== "none" ? STATUS[s].border : theme.border
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "10px 12px",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              minWidth: 88,
                              color: theme.text,
                            }}
                          >
                            {fmtDate(date)}
                          </div>
                          <div style={{ display: "flex", gap: 5, flex: 1 }}>
                            {["present", "late", "absent"].map((st) => (
                              <button
                                key={st}
                                onClick={() => {
                                  setDraftStatus(date, s === st ? "" : st);
                                  if (st !== "present" && s !== st)
                                    setOpenDetail(date);
                                  if (st === "present") setOpenDetail(null);
                                }}
                                style={{
                                  flex: 1,
                                  padding: "5px 0",
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  border: `1px solid ${STATUS[st].border}`,
                                  background:
                                    s === st
                                      ? STATUS[st].bg
                                      : dark
                                      ? "#1e293b"
                                      : "#f8fafc",
                                  color:
                                    s === st ? STATUS[st].color : "#cbd5e1",
                                }}
                              >
                                {STATUS[st].short}
                              </button>
                            ))}
                          </div>
                          {s !== "none" && (
                            <span
                              style={{
                                fontSize: 11,
                                color: STATUS[s].color,
                                fontWeight: 700,
                                minWidth: 28,
                              }}
                            >
                              {STATUS[s].label}
                            </span>
                          )}
                          {(s === "late" || s === "absent") && (
                            <button
                              onClick={() =>
                                setOpenDetail(isOpen ? null : date)
                              }
                              style={{
                                fontSize: 11,
                                color: theme.sub,
                                background: theme.bg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: 6,
                                padding: "3px 8px",
                                cursor: "pointer",
                              }}
                            >
                              {isOpen ? "閉じる" : "詳細"}
                            </button>
                          )}
                        </div>
                        {isOpen && (s === "late" || s === "absent") && (
                          <div
                            style={{
                              background: theme.bg,
                              borderTop: `1px solid ${theme.border}`,
                              padding: "10px 12px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            {s === "late" && (
                              <div>
                                <label
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: theme.sub,
                                    display: "block",
                                    marginBottom: 4,
                                  }}
                                >
                                  到着予定時刻
                                </label>
                                <input
                                  type="time"
                                  value={entry.arrivalTime || ""}
                                  onChange={(e) =>
                                    setDraftField(
                                      date,
                                      "arrivalTime",
                                      e.target.value
                                    )
                                  }
                                  style={{
                                    ...ti(),
                                    width: "auto",
                                    padding: "6px 10px",
                                  }}
                                />
                              </div>
                            )}
                            <div>
                              <label
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: theme.sub,
                                  display: "block",
                                  marginBottom: 4,
                                }}
                              >
                                理由（任意）
                              </label>
                              <input
                                value={entry.reason || ""}
                                onChange={(e) =>
                                  setDraftField(date, "reason", e.target.value)
                                }
                                placeholder="例：体調不良、学校行事"
                                style={ti()}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={submitSelfReport}
                  disabled={filledCount === 0}
                  style={{
                    width: "100%",
                    padding: "13px 0",
                    background: filledCount > 0 ? "#3b82f6" : "#e2e8f0",
                    color: filledCount > 0 ? "#fff" : "#94a3b8",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: filledCount > 0 ? "pointer" : "default",
                  }}
                >
                  申告を送信（{filledCount}件）
                </button>
              </>
            )}

            {srStep === 2 && srSaved && (
              <div style={{ ...tc(), textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#16a34a",
                    marginBottom: 6,
                  }}
                >
                  申告を送信しました
                </div>
                <div
                  style={{ fontSize: 13, color: theme.sub, marginBottom: 20 }}
                >
                  {srMemberName} さんの {filledCount} 件
                </div>
                <button
                  onClick={resetSelf}
                  style={{ ...btn(), padding: "10px 28px" }}
                >
                  別の人が申告する
                </button>
              </div>
            )}
          </>
        )}

        {/* ══ ADMIN ══ */}
        {view === "admin" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
                ...tc(),
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: theme.sub,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                日付
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ ...ti(), width: "auto", flex: 1 }}
              />
            </div>

            <FilterControls />

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={allPresentFiltered}
                style={{
                  flex: 1,
                  ...btn("#22c55e", "#fff", { padding: "9px 0", fontSize: 13 }),
                }}
              >
                ✓ 表示中（{filteredMembers.length}名）を出席
              </button>
              <button
                onClick={clearDay}
                style={{
                  flex: 1,
                  ...btn(theme.bg, theme.sub, {
                    padding: "9px 0",
                    fontSize: 13,
                    border: `1px solid ${theme.border}`,
                  }),
                }}
              >
                リセット
              </button>
            </div>

            <div style={{ ...tc(), marginBottom: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>📝 練習メモ</div>
                <button
                  onClick={() => {
                    setMemoText(practiceMemos[selectedDate] || "");
                    setEditingMemo(true);
                  }}
                  style={{
                    fontSize: 12,
                    color: "#3b82f6",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  編集
                </button>
              </div>
              {editingMemo ? (
                <div>
                  <textarea
                    value={memoText}
                    onChange={(e) => setMemoText(e.target.value)}
                    rows={3}
                    placeholder="今日の練習内容、連絡事項など…"
                    style={{ ...ti(), resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => {
                        setPracticeMemos((m) => ({
                          ...m,
                          [selectedDate]: memoText,
                        }));
                        setEditingMemo(false);
                      }}
                      style={{ ...btn(), padding: "7px 16px", fontSize: 13 }}
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingMemo(false)}
                      style={{
                        ...btn(theme.bg, theme.sub, {
                          padding: "7px 16px",
                          fontSize: 13,
                          border: `1px solid ${theme.border}`,
                        }),
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: practiceMemos[selectedDate] ? theme.text : theme.sub,
                  }}
                >
                  {practiceMemos[selectedDate] || "メモなし"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredMembers.map((m) => {
                const s = getStatus(m.id);
                const sr = getSR(m.id);
                const rec = getRecord(m.id);
                return (
                  <div
                    key={m.id}
                    style={{
                      ...tc(),
                      borderLeft: `4px solid ${STATUS[s].color}`,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: theme.sub }}>
                        {m.grade} · {m.role}
                      </div>
                    </div>
                    {sr && (
                      <div
                        style={{
                          marginBottom: 8,
                          background: theme.bg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 7,
                          padding: "7px 10px",
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            color: theme.sub,
                            fontWeight: 600,
                            marginBottom: 2,
                          }}
                        >
                          📩 事前申告
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              color: STATUS[sr.status]?.color,
                              fontWeight: 700,
                            }}
                          >
                            {STATUS[sr.status]?.label}
                          </span>
                          {sr.arrivalTime && (
                            <span style={{ color: theme.sub }}>
                              到着 {sr.arrivalTime}
                            </span>
                          )}
                          {sr.reason && (
                            <span style={{ color: theme.sub }}>
                              「{sr.reason}」
                            </span>
                          )}
                          <button
                            onClick={() => applyReport(m.id)}
                            style={{
                              marginLeft: "auto",
                              ...btn("#eff6ff", "#3b82f6", {
                                padding: "3px 10px",
                                fontSize: 11,
                                border: "1px solid #93c5fd",
                              }),
                            }}
                          >
                            反映
                          </button>
                        </div>
                      </div>
                    )}
                    {rec.reason && (
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.sub,
                          marginBottom: 6,
                        }}
                      >
                        理由：{rec.reason}
                        {rec.arrivalTime && ` 到着予定 ${rec.arrivalTime}`}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      {["present", "late", "absent"].map((st) => (
                        <button
                          key={st}
                          onClick={() =>
                            setStatusAdmin(m.id, s === st ? "none" : st)
                          }
                          style={{
                            flex: 1,
                            padding: "5px 0",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            border: `1px solid ${STATUS[st].border}`,
                            background:
                              s === st
                                ? STATUS[st].bg
                                : dark
                                ? "#1e293b"
                                : "#f8fafc",
                            color: s === st ? STATUS[st].color : "#94a3b8",
                          }}
                        >
                          {STATUS[st].label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ HISTORY ══ */}
        {view === "history" && (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>📊 出席履歴</div>
              <select
                value={historyMemberId}
                onChange={(e) => setHistoryMemberId(e.target.value)}
                style={{ ...ti(), width: "auto", flex: 1 }}
              >
                <option value="all">全員</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => exportCSV(members, records)}
                style={{
                  ...btn("#475569", "#fff", {
                    padding: "8px 12px",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }),
                }}
              >
                📥 CSV
              </button>
            </div>

            <div style={{ ...tc(), marginBottom: 14 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 10,
                  color: theme.sub,
                }}
              >
                出席率
              </div>
              {(historyMemberId === "all"
                ? members
                : members.filter((m) => m.id == historyMemberId)
              ).map((m) => {
                const { rate, streak } = memberStats[m.id];
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 600, minWidth: 80 }}
                    >
                      {m.name}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 8,
                          background: theme.border,
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${rate}%`,
                            height: "100%",
                            background:
                              rate >= 80
                                ? "#22c55e"
                                : rate >= 50
                                ? "#f59e0b"
                                : "#ef4444",
                            borderRadius: 99,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          rate >= 80
                            ? "#22c55e"
                            : rate >= 50
                            ? "#f59e0b"
                            : "#ef4444",
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {rate}%
                    </div>
                    {streak > 2 && (
                      <div style={{ fontSize: 11, color: "#f59e0b" }}>
                        🔥{streak}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {allDates.map((date) => {
              const list =
                historyMemberId === "all"
                  ? members
                  : members.filter((m) => m.id == historyMemberId);
              const counts = {
                present: list.filter(
                  (m) => records[date]?.[m.id]?.status === "present"
                ).length,
                late: list.filter(
                  (m) => records[date]?.[m.id]?.status === "late"
                ).length,
                absent: list.filter(
                  (m) => records[date]?.[m.id]?.status === "absent"
                ).length,
              };
              return (
                <div key={date} style={{ ...tc(), marginBottom: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {fmtDate(date)}
                    </div>
                    {practiceMemos[date] && (
                      <span style={{ fontSize: 11, color: "#3b82f6" }}>📝</span>
                    )}
                  </div>
                  {practiceMemos[date] && historyMemberId !== "all" && (
                    <div
                      style={{
                        fontSize: 12,
                        color: theme.sub,
                        marginBottom: 8,
                        background: theme.bg,
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}
                    >
                      {practiceMemos[date]}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      marginBottom: 6,
                    }}
                  >
                    {list.map((m) => {
                      const rec = records[date]?.[m.id] || {};
                      const s = rec.status || "none";
                      if (s === "none") return null;
                      return (
                        <span
                          key={m.id}
                          title={rec.reason || ""}
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 99,
                            background: dark ? theme.cardBg : STATUS[s].bg,
                            color: STATUS[s].color,
                            border: `1px solid ${STATUS[s].border}`,
                          }}
                        >
                          {m.name}：{STATUS[s].label}
                          {rec.reason ? " 📝" : ""}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: theme.sub }}>
                    出席 {counts.present} / 遅刻 {counts.late} / 欠席{" "}
                    {counts.absent}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ NOTICE BOARD ══ */}
        {view === "notice" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>📢 掲示板</div>
              <button
                onClick={() => setShowAddNotice((s) => !s)}
                style={{ ...btn(), padding: "7px 14px", fontSize: 13 }}
              >
                + 投稿
              </button>
            </div>

            {showAddNotice && (
              <div style={{ ...tc(), marginBottom: 12 }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}
                >
                  新しいお知らせ
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <input
                    value={newNotice.title}
                    onChange={(e) =>
                      setNewNotice((n) => ({ ...n, title: e.target.value }))
                    }
                    placeholder="タイトル*"
                    style={ti()}
                  />
                  <textarea
                    value={newNotice.body}
                    onChange={(e) =>
                      setNewNotice((n) => ({ ...n, body: e.target.value }))
                    }
                    placeholder="本文（省略可）"
                    rows={3}
                    style={{ ...ti(), resize: "vertical" }}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={newNotice.important}
                      onChange={(e) =>
                        setNewNotice((n) => ({
                          ...n,
                          important: e.target.checked,
                        }))
                      }
                    />
                    🚨 重要なお知らせ
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={addNotice}
                      style={{ ...btn(), padding: "8px 20px", fontSize: 13 }}
                    >
                      投稿する
                    </button>
                    <button
                      onClick={() => setShowAddNotice(false)}
                      style={{
                        ...btn(theme.bg, theme.sub, {
                          padding: "8px 16px",
                          fontSize: 13,
                          border: `1px solid ${theme.border}`,
                        }),
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            {notices.map((n) => {
              const d = new Date(n.createdAt);
              return (
                <div
                  key={n.id}
                  style={{
                    ...tc(),
                    marginBottom: 10,
                    borderLeft: `4px solid ${
                      n.important ? "#ef4444" : "#3b82f6"
                    }`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          marginBottom: 3,
                        }}
                      >
                        {n.important ? "🚨 " : ""}
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 13,
                            color: theme.sub,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        style={{ fontSize: 11, color: theme.sub, marginTop: 6 }}
                      >
                        {d.getMonth() + 1}/{d.getDate()}{" "}
                        {String(d.getHours()).padStart(2, "0")}:
                        {String(d.getMinutes()).padStart(2, "0")}
                      </div>
                    </div>
                    <button
                      onClick={() => removeNotice(n.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 16,
                        color: theme.sub,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ SUGGESTION BOX (目安箱) ══ */}
        {view === "suggestion" && (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              📮 匿名の目安箱
            </div>

            <div style={{ ...tc(), marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: theme.sub, marginBottom: 10 }}>
                部活に関する意見、要望、相談などを匿名で送信できます。名前は記録されません。
              </div>
              <textarea
                value={newSuggestion}
                onChange={(e) => setNewSuggestion(e.target.value)}
                placeholder="ここにメッセージを入力..."
                rows={4}
                style={{ ...ti(), resize: "vertical", marginBottom: 10 }}
              />
              {suggestionSent ? (
                <div
                  style={{
                    color: "#16a34a",
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  ✅ メッセージを送信しました
                </div>
              ) : (
                <button
                  onClick={submitSuggestion}
                  disabled={!newSuggestion.trim()}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    background: newSuggestion.trim() ? "#3b82f6" : "#e2e8f0",
                    color: newSuggestion.trim() ? "#fff" : "#94a3b8",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: newSuggestion.trim() ? "pointer" : "default",
                  }}
                >
                  匿名で送信する
                </button>
              )}
            </div>

            <details style={{ ...tc() }}>
              <summary
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: theme.sub,
                }}
              >
                🔐 【管理者専用】届いたメッセージを見る ({suggestions.length}件)
              </summary>
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {suggestions.length === 0 && (
                  <div
                    style={{
                      fontSize: 13,
                      color: theme.sub,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    メッセージはありません
                  </div>
                )}
                {suggestions.map((s) => {
                  const d = new Date(s.createdAt);
                  return (
                    <div
                      key={s.id}
                      style={{
                        background: dark ? theme.bg : "#fffbeb",
                        padding: "12px",
                        borderRadius: 8,
                        borderLeft: "4px solid #f59e0b",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          whiteSpace: "pre-wrap",
                          color: theme.text,
                        }}
                      >
                        {s.text}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 8,
                        }}
                      >
                        <div style={{ fontSize: 11, color: theme.sub }}>
                          {d.getMonth() + 1}/{d.getDate()}{" "}
                          {String(d.getHours()).padStart(2, "0")}:
                          {String(d.getMinutes()).padStart(2, "0")}
                        </div>
                        <button
                          onClick={() => removeSuggestion(s.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )}

        {/* ══ MEMBERS ══ */}
        {view === "members" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                👥 メンバー管理
              </div>
              <button
                onClick={() => setShowAddMember((s) => !s)}
                style={{ ...btn(), padding: "7px 14px", fontSize: 13 }}
              >
                + 追加
              </button>
            </div>

            <FilterControls />

            {showAddMember && (
              <div style={{ ...tc(), marginBottom: 12 }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}
                >
                  新メンバー追加
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <input
                    value={newMember.name}
                    onChange={(e) =>
                      setNewMember((m) => ({ ...m, name: e.target.value }))
                    }
                    placeholder="名前*"
                    style={ti()}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={newMember.grade}
                      onChange={(e) =>
                        setNewMember((m) => ({ ...m, grade: e.target.value }))
                      }
                      style={{ ...ti(), flex: 1 }}
                    >
                      {GRADES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                    <select
                      value={newMember.role}
                      onChange={(e) =>
                        setNewMember((m) => ({ ...m, role: e.target.value }))
                      }
                      style={{ ...ti(), flex: 1 }}
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={newMember.note}
                    onChange={(e) =>
                      setNewMember((m) => ({ ...m, note: e.target.value }))
                    }
                    placeholder="メモ（省略可）"
                    style={ti()}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={addMember}
                      style={{ ...btn(), padding: "8px 20px", fontSize: 13 }}
                    >
                      追加する
                    </button>
                    <button
                      onClick={() => setShowAddMember(false)}
                      style={{
                        ...btn(theme.bg, theme.sub, {
                          padding: "8px 16px",
                          fontSize: 13,
                          border: `1px solid ${theme.border}`,
                        }),
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredMembers.map((m) => {
                const { rate, streak } = memberStats[m.id];
                const isEditing = editingMember === m.id;
                return (
                  <div key={m.id} style={{ ...tc() }}>
                    {isEditing ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <input
                          defaultValue={m.name}
                          onChange={(e) =>
                            updateMemberField(m.id, "name", e.target.value)
                          }
                          style={ti()}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <select
                            defaultValue={m.grade}
                            onChange={(e) =>
                              updateMemberField(m.id, "grade", e.target.value)
                            }
                            style={{ ...ti(), flex: 1 }}
                          >
                            {GRADES.map((g) => (
                              <option key={g}>{g}</option>
                            ))}
                          </select>
                          <select
                            defaultValue={m.role}
                            onChange={(e) =>
                              updateMemberField(m.id, "role", e.target.value)
                            }
                            style={{ ...ti(), flex: 1 }}
                          >
                            {ROLES.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          defaultValue={m.note}
                          onChange={(e) =>
                            updateMemberField(m.id, "note", e.target.value)
                          }
                          placeholder="メモ"
                          style={ti()}
                        />
                        <button
                          onClick={() => setEditingMember(null)}
                          style={{ ...btn(), padding: "7px 0", fontSize: 13 }}
                        >
                          完了
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>
                            {m.name}
                          </div>
                          <div style={{ fontSize: 12, color: theme.sub }}>
                            {m.grade} · {m.role}
                          </div>
                          {m.note && (
                            <div
                              style={{
                                fontSize: 11,
                                color: theme.sub,
                                marginTop: 2,
                              }}
                            >
                              {m.note}
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 4,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                color:
                                  rate >= 80
                                    ? "#22c55e"
                                    : rate >= 50
                                    ? "#f59e0b"
                                    : "#ef4444",
                                fontWeight: 700,
                              }}
                            >
                              出席率 {rate}%
                            </span>
                            {streak > 2 && (
                              <span style={{ fontSize: 11, color: "#f59e0b" }}>
                                🔥{streak}連続
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingMember(m.id)}
                          style={{
                            ...btn(theme.bg, theme.sub, {
                              padding: "5px 10px",
                              fontSize: 12,
                              border: `1px solid ${theme.border}`,
                            }),
                          }}
                        >
                          編集
                        </button>
                        <button
                          onClick={() => removeMember(m.id)}
                          style={{
                            ...btn("#fef2f2", "#ef4444", {
                              padding: "5px 10px",
                              fontSize: 12,
                              border: "1px solid #fca5a5",
                            }),
                          }}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
