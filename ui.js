/* 두 화면(index.html, baseline.html)이 함께 쓰는 작은 도구. 규칙은 classify.js(MC)에 있다. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const UI = {
    $: id => document.getElementById(id),
    esc,
    pct: x => `${Math.round((x || 0) * 100)}%`,      // 비율(0~1) → "35%"
    orDash: v => v == null ? "-" : `${v}%`,           // 이미 %인 숫자 → "35%", 없으면 "-"
    shortStem: (s, n = 90) => s.length > n ? s.slice(0, n) + "…" : s,
    // "개념 체크 20% · 개념 활용 20% …"
    fmtDist: (keys, dist, sep = " · ") => keys.map(k => `${k} ${UI.pct(dist[k])}`).join(sep),
    // 문항별 표의 앞 다섯 칸 (번호, 문제, 유형, 예상 난이도, 근거). 마지막 칸은 화면마다 다르다.
    labelCells: (it, l) => `<td>${l.id}</td><td class="stem">${esc(UI.shortStem(it.stem))}${l.missingAnswer ? ' <span class="err">(정답 없음)</span>' : ""}</td>` +
      `<td>${esc(l.type)}</td><td>${esc(l.level)}</td><td>${esc(l.reasons.join(", ") || "-")}</td>`,
    // 발문을 화면에 그린다: 챗 앱이 그린 표(| a | b |)는 표로, 나머지는 줄바꿈 그대로
    stemHtml: stem => {
      const out = []; let rows = [], head = false;
      const flush = () => { if (!rows.length) return;
        out.push(`<div class="tablewrap"><table>${rows.map((r, i) => `<tr>${r.map(c => head && i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>`);
        rows = []; head = false; };
      String(stem).split("\n").forEach(line => {
        const m = /^\s*\|(.+)\|\s*$/.exec(line);
        if (!m) { flush(); out.push(esc(line) + "<br>"); return; }
        const cells = m[1].split("|").map(c => c.trim());
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) head = rows.length === 1;   // |---|---| 줄: 바로 윗줄이 머리글
        else rows.push(cells);
      });
      flush();
      return out.join("").replace(/<br>$/, "");
    },
    // 붙여 넣은 글을 문항으로 나눈다. 문제가 있으면 { error } 를 돌려준다.
    parseOrError: raw => {
      if (!String(raw || "").trim()) return { error: "붙여 넣은 내용이 없습니다." };
      const items = MC.parseAI(raw);
      return items.length ? { items } : { error: "문항을 찾지 못했습니다. '1.', '2.'처럼 번호가 붙은 문제가 들어 있는지 확인해 주세요." };
    },
  };
  window.UI = UI;
})();
