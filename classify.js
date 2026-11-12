/* AI 예상문제 점검표: 문항 나누기, 유형·예상 난이도 붙이기, 기출과 비교, 다시 요청 문장 만들기.
   - 문항 나누기(parseAI)는 mockgap-study / session-frame 의 규칙에서 출발했다. 달라진 점은 파서 위의 주석에 있다.
   - 유형과 난이도는 학습하지 않는 규칙이다. AI 문제와 기출 문제에 똑같은 규칙을 써야 비교가 공정하다.
   - 브라우저에서는 window.MC, node 에서는 require("./classify.js") 로 쓴다. 문항은 어디로도 보내지 않는다. */
(function (root) {
  "use strict";
  const VERSION = "classify-v2";   // 문항 나누기나 분류 규칙이 바뀌면 올린다
  const CIRC = "①②③④⑤";
  const TYPES = ["개념 체크", "개념 활용", "응용", "서술형"];
  const LEVELS = ["하", "중", "상"];

  // ---------- 챗 앱 출력 파서 ----------
  // mockgap-study / session-frame 의 규칙에서 출발했고, 실제 AI 답(samples.js 의 first, retry)을 돌려 보고 아래를 고쳤다.
  //  - "**해설** …"처럼 쌍점 없이 굵은 글씨로만 표시한 해설도 해설로 읽는다 (전에는 마지막 선지에 붙었다)
  //  - 서술형의 소문항 (1), (2)를 선지로 세지 않는다: "서술형" 구역, "모범 답안" 표시, 선지가 2~3개뿐이고 정답이 번호가 아닌 경우
  //  - 정답·해설 뒤에 이어지는 줄은 그 정답·해설에 붙인다
  //  - 인용 표시(>)와 구분선(---)은 뺀다. 구분선 뒤의 표시 없는 줄(챗 앱의 맺음말 등)은 버린다
  const NUM = /^\s*(?:\*\*)?(?:#+\s*)?(?:문제|문항|Q|q)?\s*(\d{1,2})\s*(?:[\.\)\]번:：]|\*\*)\s*(.*)$/;
  const OPT = /^\s*(?:\*\*)?(?:[\(\[]?([1-5])[\)\]\.]|([①②③④⑤]))\s*(?:\*\*)?\s*(.+)$/;
  const ANS = /^\s*(?:\*\*)?(?:정답|답)\s*(?:\*\*)?\s*[:：]?\s*(?:\*\*)?\s*(.*)$/;
  const ANS_NUM = /[\(\[]?([1-5])[\)\]]?\s*번?|([①②③④⑤])/;
  const EXPL = /^\s*(?:\*\*)?\s*(?:해설|풀이|설명|근거)\s*(?:\*\*\s*[:：]?|[:：])\s*(?:\*\*)?\s*(.*)$/;
  const MODEL = /^\s*(?:\*\*)?(?:모범\s*답안|예시\s*답안|모범답)\s*(?:\*\*)?\s*[:：]?\s*(?:\*\*)?\s*(.*)$/;
  const MODEL_HEAD = /^[\(\[]?\s*(?:모범\s*답안|예시\s*답안|모범답)\s*[\)\]]?\s*[:：]?\s*(.*)$/;   // "정답(모범 답안)"의 뒷부분
  const SECTION = /^\s*(?:#+\s*|\*\*|\[|【)?\s*(객관식|서술형|선택형|주관식)/i;
  const META = /^\s*(?:난이도|유형|출제\s*의도|관련\s*단원|사고\s*수준)\s*[:：]/;
  const RULE = /^\s*(?:[-*_]\s*){3,}$/;
  const INLINE = /(?:(?<=\s)|^)(?:[\(\[]([1-5])[\)\]]|([①②③④⑤]))\s*/g;
  const clean = s => String(s || "").replace(/\*\*|__|`/g, "").trim();
  const join = (a, b, sep) => (a && b ? a + sep + b : a || b);
  // 한 줄에 "정답: … 해설: …"이 같이 있으면 둘로, 선지 ①~⑤가 한 줄에 있으면 선지마다 한 줄로 나눈다.
  // 선지 나누기는 발문·선지를 읽는 중이거나 새 문항이 시작되는 줄에서만 한다.
  // (해설 속의 "(1)은 …, (2)는 …, (3)은 …"을 나누면 새 문항으로 잘못 읽힌다.)
  function splitLine(line, withOptions) {
    if (/(정답|답)\s*[:：]/.test(line) && line.includes("해설")) { const i = line.search(/해설\s*[:：]/); if (i > 0) return [line.slice(0, i).replace(/\s+$/, ""), line.slice(i)]; }
    const marks = withOptions ? [...line.matchAll(INLINE)] : [];
    if (marks.length < 3) return [line];
    const head = line.slice(0, marks[0].index).replace(/\s+$/, ""), out = head ? [head] : [];
    marks.forEach((m, i) => { const end = i + 1 < marks.length ? marks[i + 1].index : line.length, body = line.slice(m.index + m[0].length, end).trim();
      out.push(m[1] ? `${m[1]}) ${body}` : `${m[2]} ${body}`); });
    return out; }
  // cur.part: 지금 읽고 있는 부분 (stem → options → answer → expl, closed 는 구분선 뒤)
  function parseAI(text) { const items = []; let cur = null, section = "";
    const inQuestion = () => !!cur && (cur.part === "stem" || cur.part === "options");
    const feed = line => { if (!line.trim()) return;
      if (RULE.test(line)) { if (cur) cur.part = "closed"; return; }
      const ms = SECTION.exec(line);
      if (ms && clean(line).length < 25) { section = /서술형|주관식/.test(ms[1]) ? "서술형" : "객관식"; if (cur) cur.part = "closed"; return; }
      if (META.test(line)) return;
      const mn = NUM.exec(line), mo = OPT.exec(line);
      if (mn) { const n = parseInt(mn[1], 10);
        const isOpt = inQuestion() && mo && n <= 5 && n === cur.options.length + 1 && (cur.options.length > 0 || n === 1);
        if (!isOpt && (!cur || n > cur.id || n === 1)) {
          cur = { id: n, essay: section === "서술형", stem: clean(mn[2]), options: [], answer: "", explanation: "", part: "stem" }; items.push(cur); return; } }
      if (!cur) return;
      const ma = ANS.exec(line);
      if (ma) { const a = clean(ma[1]), mh = MODEL_HEAD.exec(a);
        if (mh) { cur.essay = true; cur.answer = clean(mh[1]); } else cur.answer = a;
        cur.part = "answer"; return; }
      const mm = MODEL.exec(line); if (mm) { cur.essay = true; cur.answer = clean(mm[1]); cur.part = "answer"; return; }
      const me = EXPL.exec(line); if (me) { cur.explanation = join(cur.explanation, clean(me[1]), " "); cur.part = "expl"; return; }
      if (mo && inQuestion() && !cur.essay && cur.options.length < 5) { cur.options.push(clean(mo[3])); if (mo[2]) cur.circled = true; cur.part = "options"; return; }
      const t = clean(line);
      if (cur.part === "expl") cur.explanation = join(cur.explanation, t, " ");
      else if (cur.part === "answer") cur.answer = join(cur.answer, t, "\n");
      else if (cur.part === "options") cur.options[cur.options.length - 1] += " " + t;
      else if (cur.part === "stem") cur.stem = join(cur.stem, t, "\n"); };
    for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
      const line = raw.replace(/\s+$/, "").replace(/^\s*>\s?/, "");   // 줄 끝 공백과 인용 표시(>)를 뺀다
      splitLine(line, (inQuestion() && !cur.essay) || NUM.test(line)).forEach(feed); }
    return items.filter(it => it.stem).map((it, i) => {
      // 객관식의 정답은 첫 줄에서 번호만 남기고, 같은 줄이나 다음 줄에 이어 쓴 글은 해설로 옮긴다
      const [first, ...rest] = it.answer.split("\n"), m = ANS_NUM.exec(first);
      const bare = !!m && first.replace(ANS_NUM, "").replace(/[\s\.,]/g, "") === "";
      const essay = it.essay || it.options.length < 2 || (it.options.length < 4 && !it.circled && !bare);
      const out = { id: i + 1, type: essay ? "서술형" : "객관식", stem: it.stem, options: essay ? [] : it.options, answer: it.answer, explanation: it.explanation };
      if (essay) { if (it.options.length) out.stem += "\n" + it.options.map((o, k) => `(${k + 1}) ${o}`).join("\n"); }
      else { out.answer = m ? (m[1] || String(CIRC.indexOf(m[2]) + 1)) : "";
        const extra = (bare ? rest : [first.replace(ANS_NUM, "").replace(/^[\s\.,:：)\-–—]+/, "").trim(), ...rest]).filter(Boolean).join(" ");
        if (m && extra) out.explanation = join(extra, it.explanation, " "); }
      return out; }); }

  // ---------- 문항 특징 ----------
  // <보기> ㄱ·ㄴ·ㄷ 합답형: 발문에 <보기>와 ㄱ. 같은 진술이 있거나, 선지가 모두 ㄱ, ㄴ 조합이다.
  const HAPDAP_STEM = /(<\s*보\s*기\s*>|〈\s*보\s*기\s*〉|\[\s*보\s*기\s*\]|보기\s*에서|보기\s*중)/;
  const HAPDAP_MARK = /(^|\s)ㄱ\s*[\.\)]/;
  const HAPDAP_OPT = /^\s*[ㄱ-ㅁ](\s*[,，·]\s*[ㄱ-ㅁ])*\s*$/;
  // 자료: 표·그래프·그림·실험 결과를 읽어야 하는 문항 ("다음은 ~에 대한 설명이다" 같은 말은 자료로 보지 않는다)
  const DATA = /(^|[^가-힣])표\s*(는|를|와|에|의|이|에서|\d|\(|$)|그래프|그림|자료|실험\s*결과|측정\s*결과|\(가\)\s*[와과,]|\(나\)|나타낸\s*것|결과를\s*나타|실험\s*과정|\[\s*(실험\s*)?(과정|결과)\s*\]|(^|\n)\s*\|.+\|/;   // 끝의 둘: [과정]·[결과] 표시, 챗 앱이 그린 표(| … |)
  const CALC_UNIT = /\d+(\.\d+)?\s*(g|kg|mg|mL|L|J|kJ|W|kW|kWh|%|℃|°C|mol|M|N|m|cm|km|s|초|분|년|배|ppm|V|A)(?![A-Za-z])/g;
  const CALC_WORD = /구하시오|계산|얼마인가|몇\s*(g|mL|L|배|%|mol|개)|비율은|효율은|농도는|질량은|부피는|값은/;
  const DESIGN = /설계|실험\s*방법|탐구\s*과정|가설을|변인/;
  const ESSAY = /서술하시오|설명하시오|쓰시오|논하시오/;

  function features(it) {
    const stem = it.stem || "", options = it.options || [], both = stem + " " + options.join(" ");
    const hapdap = (HAPDAP_STEM.test(stem) && HAPDAP_MARK.test(stem)) ||
      (options.length >= 3 && options.every(o => HAPDAP_OPT.test(o)));
    return {
      hapdap,
      data: DATA.test(stem),
      // 계산: 계산을 묻는 말이 있거나, 단위가 붙은 수가 둘 이상 ("25 ℃에서"처럼 조건 하나만 있는 것은 계산이 아니다)
      calc: CALC_WORD.test(stem) || (both.match(CALC_UNIT) || []).length >= 2,
      design: DESIGN.test(stem),
      essay: it.type === "서술형" || ESSAY.test(stem),
    };
  }

  // 유형: 서술형 / 응용(두 단계 이상) / 개념 활용(한 단계) / 개념 체크
  // 예상 난이도: 규칙으로 추정한 값이다. 실제로 몇 명이 맞혔는지가 아니다.
  function label(it) {
    const f = features(it), reasons = [];
    if (f.hapdap) reasons.push("<보기> 합답형");
    if (f.data) reasons.push("자료 해석");
    if (f.calc) reasons.push("계산");
    if (f.design) reasons.push("탐구 설계");
    let type, level;
    if (f.essay) { type = "서술형"; level = (f.data || f.calc || f.design) ? "상" : "중"; reasons.unshift("서술형"); }
    else if (f.design || (f.data && f.calc) || (f.hapdap && (f.data || f.calc))) { type = "응용"; level = "상"; }
    else if (f.data || f.calc) { type = "개념 활용"; level = f.hapdap ? "상" : "중"; }
    else { type = "개념 체크"; level = f.hapdap ? "중" : "하"; }
    const missingAnswer = !String(it.answer || "").trim();
    return { id: it.id, type, level, hapdap: f.hapdap, dataOrCalc: f.data || f.calc, reasons, missingAnswer };
  }

  // ---------- 비교하는 항목 (한 곳에서만 정한다) ----------
  // field 는 label() 결과와 기준 파일에서 같은 이름을 쓴다.
  // 나눠 보는 항목(유형·난이도)은 칸마다 비율, 하나만 보는 항목(합답형·자료 계산)은 그 비율 하나를 담는다.
  const DIMS = [
    { field: "type", name: "문제 유형", keys: TYPES },
    { field: "level", name: "예상 난이도", keys: LEVELS },
    { field: "hapdap", name: "<보기> ㄱ·ㄴ·ㄷ 합답형", keys: ["합답형"], single: true },
    { field: "dataOrCalc", name: "자료 해석·계산", keys: ["자료·계산"], single: true },
  ];
  const OTHER = "그 밖";
  const SHORTAGE_MIN = 0.10;     // 기출보다 이만큼(10%p) 넘게 적은 칸만 "부족한 점"으로 띄운다
  const WARN_BELOW = 70;         // 닮은 정도가 이보다 낮으면 "다 맞혀도 보장하지 않는다" 경고
  const UNPRACTICED_MIN = 0.10;  // 기출에서 이 비율 이상인 유형을 연습하지 않았으면 알려 준다

  // 하나만 보는 항목은 {합답형: p, 그 밖: 1 - p} 로 펴서 나눠 보는 항목과 같은 방식으로 다룬다.
  const asDist = (d, v) => d.single ? { [d.keys[0]]: v, [OTHER]: 1 - v } : v;
  const shownKeys = d => d.single ? [d.keys[0], OTHER] : d.keys;

  // ---------- 세트 요약 ----------
  function share(labels, pick) { return labels.filter(pick).length / Math.max(1, labels.length); }
  function summarize(items) {
    const labels = items.map(label), out = { n: labels.length, labels };
    DIMS.forEach(d => { out[d.field] = d.single ? share(labels, l => l[d.field])
      : Object.fromEntries(d.keys.map(k => [k, share(labels, l => l[d.field] === k)])); });
    out.nMC = items.filter(it => it.type === "객관식").length;
    out.nEssay = labels.length - out.nMC;
    out.missingAnswers = labels.filter(l => l.missingAnswer).map(l => l.id);
    return out;
  }

  // ---------- 기출과 비교 ----------
  // 기준(baseline)에 있는 항목만 비교한다. 거리 = 두 분포의 총변동거리(0~1), 닮은 정도 = (1 - 평균 거리) × 100.
  function tv(p, q, keys) { return keys.reduce((s, k) => s + Math.abs((p[k] || 0) - (q[k] || 0)), 0) / 2; }
  function compare(sum, base) {
    const rows = DIMS.filter(d => base[d.field] != null).map(d => {
      const keys = shownKeys(d), mine = asDist(d, sum[d.field]), theirs = asDist(d, base[d.field]);
      return { name: d.name, keys, mine, theirs, distance: tv(mine, theirs, keys),
        gaps: d.keys.map(k => ({ k, d: (theirs[k] || 0) - (mine[k] || 0) })) };
    });
    const similarity = rows.length ? Math.round((1 - rows.reduce((s, r) => s + r.distance, 0) / rows.length) * 100) : null;
    const shortages = rows.flatMap(r => r.gaps).filter(g => g.d >= SHORTAGE_MIN).sort((a, b) => b.d - a.d).slice(0, 3)
      .map(g => `기출보다 '${g.k}' 문제가 ${Math.round(g.d * 100)}%p 적어요.`);
    return { rows, similarity, shortages, warn: similarity != null && similarity < WARN_BELOW };
  }

  // ---------- 다시 요청 문장 ----------
  // 기준에 있는 항목만 문항 수로 바꿔 넣는다 (객관식 16 + 서술형 4 기준).
  function retryPrompt(base, unit) {
    const nMC = 16, nEssay = 4, total = nMC + nEssay, count = (p, n) => Math.round((p || 0) * n);
    const scope = (unit || "").trim() ? `${unit.trim()} 단원 범위로 ` : "같은 범위로 ";
    const lines = [`방금 만든 예상문제는 실제 학교 시험과 형식이 달라. ${scope}시험 예상문제를 다시 만들어 줘.`,
      `- 전체 ${total}문항 (객관식 ${nMC}문항은 보기 5개, 서술형 ${nEssay}문항), 문항마다 정답과 해설`];
    if (base.hapdap != null) lines.push(`- 객관식 중 ${Math.max(1, count(base.hapdap, nMC))}문항 이상은 <보기>의 ㄱ, ㄴ, ㄷ 중 옳은 것을 모두 고르는 형식`);
    if (base.dataOrCalc != null) lines.push(`- ${Math.max(1, count(base.dataOrCalc, total))}문항 이상은 표, 그래프, 실험 결과를 해석하거나 계산해야 푸는 문제`);
    lines.push(base.type ? `- 교과서 문장을 그대로 묻는 단순 암기 문제는 ${count(base.type["개념 체크"], total)}문항 이하`
      : "- 교과서 문장을 그대로 묻는 단순 암기 문제는 최대한 줄이기");
    if (base.level) lines.push(`- 난이도는 ${["상", "중", "하"].map(v => `${v} ${count(base.level[v], total)}문항`).join(", ")} 정도`);
    lines.push("- 개념을 확인하는 문제만이 아니라, 개념을 새로운 상황에 적용하는 응용 문제도 섞기");
    return lines.join("\n");
  }

  // ---------- 풀어 본 결과 ----------
  // results: { 문항 번호: true(맞음) | false(틀림) | null(채점 안 함) }
  function score(labels, results, base) {
    const byType = Object.fromEntries(TYPES.map(t => [t, { right: 0, total: 0 }]));
    labels.forEach(l => { const r = results[l.id]; if (r == null) return; byType[l.type].total++; if (r) byType[l.type].right++; });
    const right = TYPES.reduce((s, t) => s + byType[t].right, 0), total = TYPES.reduce((s, t) => s + byType[t].total, 0);
    const unpracticed = base && base.type ? TYPES.filter(t => !byType[t].total && (base.type[t] || 0) >= UNPRACTICED_MIN) : [];
    return { byType, right, total, percent: total ? Math.round(100 * right / total) : null, unpracticed };
  }

  // 기준에 학교 문항분석표 정답률이 있으면 그 유형의 기출 평균 정답률(%), 없으면 null
  const baseRate = (base, type) => (base && base.correctRate && base.correctRate.type && base.correctRate.type[type] != null) ? base.correctRate.type[type] : null;

  // ---------- 기출로 기준 만들기 ----------
  // 문항 원문은 담지 않고 비율과 평균 정답률만 담는다. rates: { 문항 번호: 정답률(%) }, 빈 값은 뺀다.
  function makeBaseline(sum, name, rates) {
    const base = { id: "b" + Date.now().toString(36), name: (name || "").trim() || "기출 기준", n: sum.n, made_with: VERSION };
    DIMS.forEach(d => base[d.field] = sum[d.field]);
    const clean = {};
    Object.entries(rates || {}).forEach(([id, v]) => { if (String(v).trim() !== "" && !isNaN(+v)) clean[id] = Math.max(0, Math.min(100, +v)); });
    if (Object.keys(clean).length) {
      base.correctRate = { type: {} };
      TYPES.forEach(t => { const v = sum.labels.filter(l => l.type === t && clean[l.id] != null).map(l => clean[l.id]);
        base.correctRate.type[t] = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; });
    }
    return base;
  }

  // 파일로 받은 기준을 점검: 비교할 항목이 하나라도 있어야 하고, 다른 규칙 버전으로 만든 것이면 알려 준다.
  function checkBaseline(x) {
    if (!x || typeof x !== "object" || !DIMS.some(d => x[d.field] != null)) throw new Error("비교할 항목이 없는 기준 파일입니다.");
    const base = Object.assign({}, x, { id: x.id || "file-" + Math.random().toString(36).slice(2, 8) });
    const warning = x.made_with && x.made_with !== VERSION ? `다른 분류 규칙(${x.made_with})으로 만든 기준이라 비교가 정확하지 않을 수 있어요. 기출로 기준을 다시 만들어 주세요.` : "";
    return { base, warning };
  }

  const MC = { VERSION, CIRC, TYPES, LEVELS, DIMS, OTHER, parseAI, label, summarize, compare, retryPrompt, score, baseRate, makeBaseline, checkBaseline };
  if (typeof module !== "undefined" && module.exports) module.exports = MC; else root.MC = MC;
})(typeof window !== "undefined" ? window : globalThis);
