/* AI 예상문제 점검표 화면. 규칙은 classify.js(MC), 공통 도구는 ui.js(UI), 기준 목록은 baselines.js. */
(function () {
  "use strict";
  const { $, esc, pct, orDash, fmtDist, labelCells, parseOrError, stemHtml } = UI;
  const HIST_KEY = "ai-mock-check:history";
  let BASES = window.BASELINES.slice(), items = [], sum = null, cmp = null;
  const warnings = {};   // 파일로 연 기준마다 경고 (다른 규칙 버전 등)
  let history = (() => { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; } })();

  const base = () => BASES.find(b => b.id === $("base").value) || BASES[0];
  function fillBases(selectId) {
    $("base").innerHTML = BASES.map(b => `<option value="${esc(b.id)}">${esc(b.name)}${b.n ? ` · ${b.n}문항` : ""}</option>`).join("");
    if (selectId) $("base").value = selectId;
    onBaseChange();
  }
  function onBaseChange() {
    $("basenote").textContent = [base()?.note, warnings[base()?.id]].filter(Boolean).join(" ");
    showPrompts();
    if (sum) renderComparison(false);   // 기준만 바꾼 것이니 다시 나누지 않고, 풀던 문제도 그대로 둔다
  }
  // AI에게 보낼 문장 두 개 (처음 요청, 다시 요청). 단원 이름이나 기준이 바뀌면 다시 쓴다.
  function showPrompts() {
    $("firstPrompt").value = MC.firstPrompt(base(), $("unit").value);
    $("prompt").value = MC.retryPrompt(base(), $("unit").value);
  }

  // ---------- 막대 ----------
  const seg = (keys, dist) => keys.map((k, i) => { const w = Math.round((dist[k] || 0) * 100);
    return w ? `<div class="seg s${i % 4}" style="width:${w}%" title="${esc(k)} ${w}%">${w >= 12 ? `${esc(k)} ${w}%` : ""}</div>` : ""; }).join("");
  function bars(rows) {
    return rows.map(r => `<div class="cmp"><div class="name">${esc(r.name)}</div>
        <div class="row"><span class="who">이 세트</span><div class="bar">${seg(r.keys, r.mine)}</div></div>
        <div class="row"><span class="who">기출</span><div class="bar">${seg(r.keys, r.theirs)}</div></div>
        <div class="legend">이 세트: ${esc(fmtDist(r.keys, r.mine))}<br>기출: ${esc(fmtDist(r.keys, r.theirs))}</div></div>`).join("");
  }

  // ---------- 이 세트의 라벨 (기준과 관계없이 세트만 보고 정한다) ----------
  function showSetLabels() {
    const split = MC.DIMS.filter(d => !d.single);   // 문제 유형, 예상 난이도
    $("selfBars").innerHTML = split.map(d => `<div class="cmp"><div class="name">${esc(d.name)}</div>
        <div class="row"><div class="bar">${seg(d.keys, sum[d.field])}</div></div>
        <div class="legend">${esc(d.keys.map(k => `${k} ${Math.round(sum[d.field][k] * sum.n)}문항`).join(" · "))}</div></div>`).join("");
    const type = MC.topOf(MC.TYPES, sum.type), level = MC.topOf(MC.LEVELS, sum.level);
    $("headline").textContent = `이 세트는 '${type.key}' 문제가 ${pct(type.share)}로 가장 많고, 난이도 '${level.key}' 문제가 ${pct(level.share)}로 가장 많아요.` +
      (sum.type["개념 체크"] >= 0.5 ? " 개념 체크 문제는 다 맞혀도, 자료를 해석하거나 계산하는 문제까지 풀 수 있다는 뜻은 아니에요." : "");
  }

  // ---------- 점검: 문항 나누기(점검하기를 누를 때만) ----------
  function analyze() {
    const parsed = parseOrError($("raw").value);
    $("err").textContent = parsed.error || "";
    if (parsed.error) return;
    items = parsed.items;
    sum = MC.summarize(items);
    $("count").textContent = `인식한 문항 ${sum.n}개 (객관식 ${sum.nMC}, 서술형 ${sum.nEssay})` +
      (sum.missingAnswers.length ? ` · 정답이 안 보이는 문항: ${sum.missingAnswers.join(", ")}번` : "");
    $("quiz").innerHTML = ""; $("score").innerHTML = ""; $("solve").disabled = false;
    $("result").classList.remove("hidden");
    showSetLabels();
    renderComparison(true);
  }

  // ---------- 기준과 비교해 보여 주기 (기준을 바꾸면 이것만 다시) ----------
  function renderComparison(record) {
    const b = base();
    cmp = MC.compare(sum, b);
    $("sim").textContent = cmp.similarity == null ? "-" : `${cmp.similarity}%`;
    $("bars").innerHTML = bars(cmp.rows);
    $("gaps").innerHTML = cmp.shortages.map(s => `<li>${esc(s)}</li>`).join("");
    $("warn").textContent = cmp.warn ? "이 세트를 다 맞혀도 시험 점수를 보장하지 않아요. 아래 4번 문장으로 다시 요청해 보세요." : "";

    // 예상 정답률: 기준에 실제 정답률(문항분석표)이 있을 때만 숫자가 나온다
    const hasRate = MC.TYPES.some(t => MC.baseRate(b, t) != null);
    $("rateNote").textContent = hasRate ? "" : "지금 고른 기준에는 실제 정답률 자료가 없어서 '-'로 나옵니다. 문항분석표 정답률을 넣어 기준을 만들면 숫자가 나옵니다.";
    $("rows").innerHTML = sum.labels.map((l, i) => `<tr>${labelCells(items[i], l)}<td>${orDash(MC.baseRate(b, l.type))}</td></tr>`).join("");

    if (record) addHistory();
    showHistory();
  }

  // ---------- 점검 기록 (다시 요청하면 닮은 정도가 어떻게 바뀌었는지) ----------
  function saveHistory() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch (e) {} }
  function addHistory() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    history = history.concat([{ at: `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`, n: sum.n, similarity: cmp.similarity, base: base().id }]).slice(-20);
    saveHistory();
  }
  function showHistory() {
    const h = history.filter(x => x.base === base().id);
    $("histTable").classList.toggle("hidden", h.length < 2);
    $("hist").innerHTML = h.map((x, i) => `<tr><td>${i + 1}번째</td><td>${esc(x.at)}</td><td>${x.n}</td><td>${orDash(x.similarity)}</td></tr>`).join("");
  }

  // ---------- 풀어 보기 ----------
  function quiz() {
    $("solve").disabled = true;
    $("quiz").innerHTML = items.map(it => {
      const head = `<div class="item"><div class="q"><b>${it.id}.</b> ${stemHtml(it.stem)}${it.type === "서술형" ? ' <span class="small">(서술형)</span>' : ""}</div>`;
      const tail = `<p class="small" id="m${it.id}"></p></div>`;
      const body = it.type === "객관식"
        ? it.options.map((o, k) => `<label><input type="radio" name="q${it.id}" value="${k + 1}"> ${MC.CIRC[k]} ${esc(o)}</label>`).join("") +
          (it.answer ? "" : '<p class="small">정답이 없어 채점에서 뺍니다.</p>')
        : `<textarea style="min-height:70px"></textarea>
           <details><summary>모범 답안 보고 스스로 채점</summary><div class="q">${stemHtml(it.answer || "(모범 답안 없음)")}</div>
           <label><input type="radio" name="s${it.id}" value="1"> 맞음</label><label><input type="radio" name="s${it.id}" value="0"> 틀림</label></details>`;
      return head + body + tail;
    }).join("") + `<button id="grade">채점</button>`;
    $("grade").onclick = grade;
  }
  function grade() {
    const results = {};
    items.forEach(it => {
      const m = $("m" + it.id);
      if (it.type === "객관식" && it.answer) {
        const c = document.querySelector(`input[name=q${it.id}]:checked`), ok = !!c && c.value === String(it.answer);
        results[it.id] = ok;
        m.innerHTML = ok ? '<span class="mark-ok">맞음</span>' : `<span class="mark-no">틀림</span> · 정답 ${MC.CIRC[+it.answer - 1] || esc(it.answer)}${it.explanation ? ` · ${esc(it.explanation)}` : ""}`;
      } else if (it.type === "서술형") {
        const c = document.querySelector(`input[name=s${it.id}]:checked`);
        results[it.id] = c ? c.value === "1" : null;
        m.textContent = c ? "" : "스스로 채점하지 않아 뺍니다.";
      }
    });
    const b = base(), s = MC.score(sum.labels, results, b), percent = s.percent ?? 0;
    const hasRate = MC.TYPES.some(t => MC.baseRate(b, t) != null);
    const rows = MC.TYPES.map(t => { const x = s.byType[t];
      const cells = [t, x.total ? `${x.right}/${x.total} (${Math.round(100 * x.right / x.total)}%)` : "연습 안 함"];
      if (b.type) cells.push(pct(b.type[t]));
      if (hasRate) cells.push(orDash(MC.baseRate(b, t)));
      return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`; }).join("");
    $("score").innerHTML = `<h2>풀어 본 결과</h2>
      <p>전체 <span class="big">${percent}%</span> (${s.right}/${s.total})</p>
      <table><thead><tr><th>유형</th><th>내 정답</th>${b.type ? "<th>기출에서 이 유형 비율</th>" : ""}${hasRate ? "<th>기출 같은 유형 평균 정답률</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>
      ${cmp.warn ? `<p>이 세트에서 ${percent}%를 맞혔어도, 기출과 닮은 정도가 ${cmp.similarity}%라서 이 점수로 시험 점수를 짐작하면 안 돼요.</p>` : ""}
      ${s.unpracticed.length ? `<p>기출에 자주 나오지만 이번에 연습하지 못한 유형: ${s.unpracticed.join(", ")}</p>` : ""}`;
    $("score").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- 기준 파일 열기 (이 브라우저에서만 씀) ----------
  $("basefile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const raw = JSON.parse(await f.text()), checked = (Array.isArray(raw) ? raw : [raw]).map(MC.checkBaseline);
      checked.forEach(({ base: x, warning }) => { BASES = BASES.filter(y => y.id !== x.id).concat([x]); warnings[x.id] = warning; });
      $("err").textContent = "";
      fillBases(checked[0].base.id);
    } catch (err) { $("err").textContent = `기준 파일을 읽지 못했습니다. ${err.message || ""}`; }
  };

  $("check").onclick = analyze;
  // ---------- 돌려 볼 예시 (samples.js 의 SAMPLE_LIST) ----------
  const sample = () => window.SAMPLE_LIST.find(x => x.key === $("sampleSel").value) || window.SAMPLE_LIST[0];
  $("sampleSel").innerHTML = window.SAMPLE_LIST.map(x => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join("");
  $("sampleSel").onchange = () => { $("sampleNote").textContent = sample().note || ""; };
  $("sampleSel").onchange();
  $("sample").onclick = () => { $("raw").value = window.SAMPLES[sample().key]; if (!$("unit").value) { $("unit").value = "통합과학2 화학 변화"; showPrompts(); } };
  $("base").onchange = onBaseChange;
  $("unit").oninput = showPrompts;
  $("solve").onclick = quiz;
  $("clearHist").onclick = () => { history = []; saveHistory(); showHistory(); };
  // "문장 복사" 버튼: data-from 에 적힌 칸의 글을 복사하고, 바로 옆 칸에 결과를 적는다
  document.querySelectorAll("button.copy").forEach(btn => { btn.onclick = () => { const box = $(btn.dataset.from), note = btn.nextElementSibling;
    navigator.clipboard.writeText(box.value).then(() => note.textContent = "복사됨", () => { box.select(); note.textContent = "직접 복사해 주세요"; }); }; });

  fillBases();
})();
