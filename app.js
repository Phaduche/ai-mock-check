/* AI 예상문제 점검표 화면. 규칙은 classify.js (window.MC) 에 있다. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = x => `${Math.round((x || 0) * 100)}%`;
  const CIRC = "①②③④⑤";
  // baselines.json 을 못 읽을 때(파일을 더블클릭해 열었을 때) 쓰는 기본값. baselines.json 과 같게 유지한다.
  const FALLBACK = [{ id: "pilot-summary", name: "통합과학2 기출 67문항 (팀 예비 조사 요약값)", n: 67, hapdap: 0.80, dataOrCalc: 0.90,
    note: "팀 연구 문서의 예비 조사 요약(합답형 약 80%, 자료 해석·계산 약 90%)을 옮긴 값입니다. 유형·난이도 비율과 정답률은 실제 기출로 기준을 만들면 채워집니다." }];
  const HIST_KEY = "ai-mock-check:history";
  let BASES = [], items = [], sum = null, cmp = null;

  const base = () => BASES.find(b => b.id === $("base").value) || BASES[0];
  function fillBases(selectId) {
    $("base").innerHTML = BASES.map(b => `<option value="${esc(b.id)}">${esc(b.name)}${b.n ? ` · ${b.n}문항` : ""}</option>`).join("");
    if (selectId) $("base").value = selectId;
    showBaseNote();
  }
  function showBaseNote() { const b = base(); $("basenote").textContent = b && b.note ? b.note : ""; if (sum) run(false); }

  // ---------- 막대 ----------
  function bars(rows) {
    return rows.map(r => {
      const seg = (dist) => r.keys.map((k, i) => { const w = Math.round((dist[k] || 0) * 100);
        return w ? `<div class="seg s${i % 4}" style="width:${w}%" title="${esc(k)} ${w}%">${w >= 12 ? `${esc(k)} ${w}%` : ""}</div>` : ""; }).join("");
      const legend = (dist) => r.keys.map(k => `${esc(k)} ${pct(dist[k])}`).join(" · ");
      return `<div class="cmp"><div class="name">${esc(r.name)}</div>
        <div class="row"><span class="who">이 세트</span><div class="bar">${seg(r.mine)}</div></div>
        <div class="row"><span class="who">기출</span><div class="bar">${seg(r.theirs)}</div></div>
        <div class="legend">이 세트: ${legend(r.mine)}<br>기출: ${legend(r.theirs)}</div></div>`;
    }).join("");
  }

  // ---------- 점검 ----------
  function run(record) {
    $("err").textContent = "";
    const raw = $("raw").value;
    if (!raw.trim()) { $("err").textContent = "붙여 넣은 내용이 없습니다."; return; }
    items = MC.parseAI(raw);
    if (!items.length) { $("err").textContent = "문항을 찾지 못했습니다. '1.', '2.'처럼 번호가 붙은 문제가 들어 있는지 확인해 주세요."; return; }
    const b = base();
    sum = MC.summarize(items);
    cmp = MC.compare(sum, b);

    $("sim").textContent = cmp.similarity == null ? "-" : `${cmp.similarity}%`;
    $("bars").innerHTML = bars(cmp.rows);
    $("gaps").innerHTML = cmp.shortages.map(s => `<li>${esc(s)}</li>`).join("");
    $("warn").textContent = cmp.warn ? "이 세트를 다 맞혀도 시험 점수를 보장하지 않아요. 아래 4번 문장으로 다시 요청해 보세요." : "";

    $("count").textContent = `인식한 문항 ${sum.n}개 (객관식 ${sum.nMC}, 서술형 ${sum.nEssay})` +
      (sum.missingAnswers.length ? ` · 정답이 안 보이는 문항: ${sum.missingAnswers.join(", ")}번` : "");
    const rate = b.correctRate && b.correctRate.type;
    $("rateHead").classList.toggle("hidden", !rate);
    $("rows").innerHTML = sum.labels.map((l, i) => { const it = items[i];
      const stem = it.stem.length > 90 ? it.stem.slice(0, 90) + "…" : it.stem;
      const r = rate && rate[l.type] != null ? `${rate[l.type]}%` : "-";
      return `<tr><td>${l.id}</td><td class="stem">${esc(stem)}${l.missingAnswer ? ' <span class="err">(정답 없음)</span>' : ""}</td><td>${esc(l.type)}</td><td>${esc(l.level)}</td><td>${esc(l.reasons.join(", ") || "-")}</td>${rate ? `<td>${r}</td>` : ""}</tr>`;
    }).join("");

    $("prompt").value = MC.retryPrompt(sum, b, { unit: $("unit").value });
    $("quiz").innerHTML = ""; $("score").innerHTML = ""; $("solve").disabled = false;
    $("result").classList.remove("hidden");
    if (record) addHistory();
    showHistory();
  }

  // ---------- 점검 기록 (다시 요청하면 닮은 정도가 어떻게 바뀌었는지) ----------
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; } }
  function addHistory() {
    const h = loadHist(), d = new Date(), p = n => String(n).padStart(2, "0");
    h.push({ at: `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`, n: sum.n, similarity: cmp.similarity, base: base().id });
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-20))); } catch (e) {}
  }
  function showHistory() {
    const h = loadHist().filter(x => x.base === base().id);
    $("histTable").classList.toggle("hidden", h.length < 2);
    $("hist").innerHTML = h.map((x, i) => `<tr><td>${i + 1}번째</td><td>${esc(x.at)}</td><td>${x.n}</td><td>${x.similarity == null ? "-" : x.similarity + "%"}</td></tr>`).join("") +
      `<tr><td colspan="4"><button id="clearHist">기록 지우기</button></td></tr>`;
    const c = $("clearHist"); if (c) c.onclick = () => { try { localStorage.removeItem(HIST_KEY); } catch (e) {} showHistory(); };
  }

  // ---------- 풀어 보기 ----------
  function quiz() {
    $("solve").disabled = true;
    $("quiz").innerHTML = items.map((it, i) => {
      const l = sum.labels[i];
      if (it.type === "객관식") return `<div class="item"><div class="q"><b>${it.id}.</b> ${esc(it.stem)}</div>
        ${it.options.map((o, k) => `<label><input type="radio" name="q${it.id}" value="${k + 1}"> ${CIRC[k]} ${esc(o)}</label>`).join("")}
        ${it.answer ? "" : '<p class="small">정답이 없어 채점에서 뺍니다.</p>'}<p class="small" id="m${it.id}"></p></div>`;
      return `<div class="item"><div class="q"><b>${it.id}.</b> ${esc(it.stem)} <span class="small">(${esc(l.type)})</span></div>
        <textarea id="e${it.id}" style="min-height:70px"></textarea>
        <details><summary>모범 답안 보고 스스로 채점</summary><p>${esc(it.answer || "(모범 답안 없음)")}</p>
        <label><input type="radio" name="s${it.id}" value="1"> 맞음</label><label><input type="radio" name="s${it.id}" value="0"> 틀림</label></details>
        <p class="small" id="m${it.id}"></p></div>`;
    }).join("") + `<button id="grade">채점</button>`;
    $("grade").onclick = grade;
  }
  function grade() {
    const by = {}; MC.TYPES.forEach(t => by[t] = { right: 0, total: 0 });
    items.forEach((it, i) => {
      const l = sum.labels[i], m = $("m" + it.id);
      let ok = null;
      if (it.type === "객관식" && it.answer) { const c = document.querySelector(`input[name=q${it.id}]:checked`); ok = !!c && c.value === String(it.answer);
        m.innerHTML = ok ? '<span class="mark-ok">맞음</span>' : `<span class="mark-no">틀림</span> · 정답 ${CIRC[+it.answer - 1] || it.answer}${it.explanation ? ` · ${esc(it.explanation)}` : ""}`; }
      else if (it.type === "서술형") { const c = document.querySelector(`input[name=s${it.id}]:checked`); if (c) ok = c.value === "1";
        m.textContent = c ? "" : "스스로 채점하지 않아 뺍니다."; }
      if (ok !== null) { by[l.type].total++; if (ok) by[l.type].right++; }
    });
    const all = Object.values(by).reduce((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 });
    const b = base(), rate = b.correctRate && b.correctRate.type;
    const rows = MC.TYPES.map(t => { const x = by[t];
      return `<tr><td>${t}</td><td>${x.total ? `${x.right}/${x.total} (${Math.round(100 * x.right / x.total)}%)` : "연습 안 함"}</td>${b.type ? `<td>${pct(b.type[t])}</td>` : ""}${rate ? `<td>${rate[t] == null ? "-" : rate[t] + "%"}</td>` : ""}</tr>`; }).join("");
    const unpracticed = b.type ? MC.TYPES.filter(t => !by[t].total && (b.type[t] || 0) >= 0.1) : [];
    $("score").innerHTML = `<h2>풀어 본 결과</h2>
      <p>전체 <span class="big">${all.total ? Math.round(100 * all.right / all.total) : 0}%</span> (${all.right}/${all.total})</p>
      <table><thead><tr><th>유형</th><th>내 정답</th>${b.type ? "<th>기출에서 이 유형 비율</th>" : ""}${rate ? "<th>기출 같은 유형 평균 정답률</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>
      ${cmp.warn ? `<p>이 세트에서 ${all.total ? Math.round(100 * all.right / all.total) : 0}%를 맞혔어도, 기출과 닮은 정도가 ${cmp.similarity}%라서 이 점수로 시험 점수를 짐작하면 안 돼요.</p>` : ""}
      ${unpracticed.length ? `<p>기출에 자주 나오지만 이번에 연습하지 못한 유형: ${unpracticed.join(", ")}</p>` : ""}`;
    $("score").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- 기준 파일 열기 (이 브라우저에서만 씀) ----------
  $("basefile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const b = JSON.parse(await f.text()); const list = Array.isArray(b) ? b : [b];
      list.forEach(x => { if (!x.id) x.id = "file-" + Math.random().toString(36).slice(2, 8); BASES = BASES.filter(y => y.id !== x.id).concat([x]); });
      fillBases(list[0].id);
    } catch (err) { $("err").textContent = "기준 파일을 읽지 못했습니다."; }
  };

  $("check").onclick = () => run(true);
  $("sample").onclick = () => { $("raw").value = window.SAMPLES.ai; if (!$("unit").value) $("unit").value = "통합과학2 화학 변화"; };
  $("base").onchange = showBaseNote;
  $("solve").onclick = quiz;
  $("copy").onclick = () => { navigator.clipboard.writeText($("prompt").value).then(() => $("copied").textContent = "복사됨", () => { $("prompt").select(); $("copied").textContent = "직접 복사해 주세요"; }); };

  fetch("baselines.json").then(r => r.json()).catch(() => FALLBACK).then(list => { BASES = list && list.length ? list : FALLBACK; fillBases(); });
})();
