// 실행: node tests/classify.test.js   (설치할 것 없음)
const assert = require("assert");
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "samples.js"));
require(path.join(__dirname, "..", "baselines.js"));
const MC = require(path.join(__dirname, "..", "classify.js"));
const { ai, exam } = window.SAMPLES;
const PILOT = window.BASELINES.find(b => b.id === "pilot-summary");   // 웹에 올라가는 기본 기준 그대로
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok", name); };

t("AI 예시: 6문항, 객관식 5 + 서술형 1, 정답 모두 있음", () => {
  const items = MC.parseAI(ai);
  assert.strictEqual(items.length, 6);
  assert.deepStrictEqual(items.map(i => i.type), ["객관식", "객관식", "객관식", "객관식", "객관식", "서술형"]);
  assert.strictEqual(items[2].options.length, 5);           // 한 줄에 ①~⑤ 가 있어도 나눈다
  assert.deepStrictEqual(MC.summarize(items).missingAnswers, []);
});

t("AI 예시: 객관식은 모두 개념 체크·하, 서술형은 중", () => {
  const labels = MC.parseAI(ai).map(MC.label);
  assert.deepStrictEqual(labels.map(l => l.type), ["개념 체크", "개념 체크", "개념 체크", "개념 체크", "개념 체크", "서술형"]);
  assert.deepStrictEqual(labels.map(l => l.level), ["하", "하", "하", "하", "하", "중"]);
});

t("기출 예시: 합답형·자료·계산을 알아본다", () => {
  const items = MC.parseAI(exam);
  assert.strictEqual(items.length, 5);
  const labels = items.map(MC.label);
  assert.deepStrictEqual(labels.map(l => l.hapdap), [true, false, true, false, false]);
  assert.deepStrictEqual(labels.map(l => l.type), ["응용", "응용", "개념 체크", "개념 활용", "서술형"]);
  assert.deepStrictEqual(labels.map(l => l.level), ["상", "상", "중", "중", "상"]);
  assert.ok(items[0].stem.includes("\nㄱ. A는 산화된다."));   // <보기> 줄을 남긴다
});

t("문항 나누기: 굵은 글씨 해설, 서술형 소문항, 정답 뒤 설명, 구분선 뒤 맺음말", () => {
  const items = MC.parseAI([
    "**1.** 산화에 대한 설명으로 옳은 것은?", "① 가 ② 나 ③ 다 ④ 라 ⑤ 마", "**정답** ②", "**해설** 산화는 산소를 얻는 반응이다.", "① 은 환원이다.", "---",
    "2. 중화점에서 혼합 용액의 액성은?", "1) 산성", "2) 중성", "3) 염기성", "4) 알 수 없다", "정답: 2번. 수소 이온과 수산화 이온이 모두 반응한다.", "",
    "3. 철이 녹스는 반응에 대해 답하시오.", "(1) 산화되는 물질을 쓰시오.", "(2) 그 까닭을 서술하시오.", "**정답(모범 답안)**", "(1) 철", "(2) 철이 산소를 얻기 때문이다.", "**해설** 산소를 얻으면 산화이다.", "---",
    "더 필요한 문제가 있으면 말해 주세요."].join("\n"));
  assert.deepStrictEqual(items.map(i => [i.type, i.options.length, i.answer.split("\n")[0]]),
    [["객관식", 5, "2"], ["객관식", 4, "2"], ["서술형", 0, "(1) 철"]]);
  assert.strictEqual(items[0].options[4], "마");                                   // 해설이 마지막 선지에 붙지 않는다
  assert.strictEqual(items[0].explanation, "산화는 산소를 얻는 반응이다. ① 은 환원이다.");
  assert.strictEqual(items[1].explanation, "수소 이온과 수산화 이온이 모두 반응한다.");   // 정답 줄에 이어 쓴 설명
  assert.ok(items[2].stem.endsWith("(1) 산화되는 물질을 쓰시오.\n(2) 그 까닭을 서술하시오."));   // 소문항은 발문에 남는다
  assert.strictEqual(items[2].answer, "(1) 철\n(2) 철이 산소를 얻기 때문이다.");
  assert.strictEqual(items[2].explanation, "산소를 얻으면 산화이다.");                 // 맺음말은 버린다
});

t("실제 AI 답 두 세트: 객관식 16(선지 5개, 정답 있음) + 서술형 4(모범 답안 있음)로 읽힌다", () => {
  const answers = { first: "2531423425135431", retry: "3425413425341512" };   // Claude Code 가 세트를 풀어 확인한 정답
  for (const key of ["first", "retry"]) {
    const items = MC.parseAI(window.SAMPLES[key]), mc = items.filter(i => i.type === "객관식"), essay = items.filter(i => i.type === "서술형");
    assert.deepStrictEqual([items.length, mc.length, essay.length], [20, 16, 4], key);
    assert.ok(mc.every(i => i.options.length === 5 && i.explanation && !i.options.some(o => o.includes("해설"))), key);
    assert.strictEqual(mc.map(i => i.answer).join(""), answers[key], key);
    assert.ok(essay.every(i => i.answer.length > 20 && i.explanation), key);
    assert.ok(!items[19].explanation.includes("알려 주면"), key);              // 챗 앱의 맺음말은 문항에 붙지 않는다
  }
  assert.deepStrictEqual(window.SAMPLE_LIST.map(x => x.key).filter(k => !window.SAMPLES[k]), []);
});

t("실제 AI 답 두 세트: 처음 세트는 기출과 다르고, 다시 요청한 세트는 가까워진다", () => {
  const sim = key => MC.compare(MC.summarize(MC.parseAI(window.SAMPLES[key])), PILOT);
  const first = MC.summarize(MC.parseAI(window.SAMPLES.first)), retry = MC.summarize(MC.parseAI(window.SAMPLES.retry));
  assert.deepStrictEqual([first.hapdap, first.dataOrCalc], [0.15, 0.2]);        // 3문항, 4문항
  assert.deepStrictEqual([retry.hapdap, retry.dataOrCalc], [0.7, 1]);           // 14문항, 20문항
  assert.deepStrictEqual([sim("first").similarity, sim("retry").similarity], [32, 90]);
  assert.strictEqual(MC.label(MC.parseAI(window.SAMPLES.first)[8]).type, "개념 체크");   // "25 ℃에서" 하나로는 계산이 아니다
  assert.ok(MC.label(MC.parseAI(window.SAMPLES.retry)[4]).reasons.includes("자료 해석"));  // 챗 앱이 그린 표도 자료
});

t("비교: 예비 조사 요약 기준이면 닮은 정도가 낮고 부족한 점 문장이 나온다", () => {
  const sum = MC.summarize(MC.parseAI(ai));
  const cmp = MC.compare(sum, PILOT);
  assert.strictEqual(cmp.rows.length, 2);
  assert.strictEqual(cmp.similarity, Math.round((1 - (PILOT.hapdap + PILOT.dataOrCalc) / 2) * 100));   // AI 예시는 둘 다 0%
  assert.ok(cmp.warn);
  assert.deepStrictEqual(cmp.shortages, [`기출보다 '자료·계산' 문제가 ${Math.round(PILOT.dataOrCalc * 100)}%p 적어요.`,
    `기출보다 '합답형' 문제가 ${Math.round(PILOT.hapdap * 100)}%p 적어요.`]);
});

t("비교: 같은 세트끼리는 닮은 정도 100", () => {
  const sum = MC.summarize(MC.parseAI(exam));
  assert.strictEqual(MC.compare(sum, MC.makeBaseline(sum, "테스트")).similarity, 100);
});

t("기준 만들기: 문항 원문 없이 비율과 평균 정답률만 담고, 정답률은 0~100으로 자른다", () => {
  const sum = MC.summarize(MC.parseAI(exam));
  const base = MC.makeBaseline(sum, "  ", { 1: "40", 2: 30, 3: 170, 4: "", 5: "x" });
  const text = JSON.stringify(base);
  assert.ok(!text.includes("산화된다") && !text.includes("stem"));
  assert.strictEqual(base.name, "기출 기준");                // 빈 이름이면 기본 이름
  assert.strictEqual(base.n, 5);
  assert.strictEqual(base.correctRate.type["응용"], 35);     // 1번 40, 2번 30
  assert.strictEqual(base.correctRate.type["개념 체크"], 100);  // 170 → 100
  assert.strictEqual(base.correctRate.type["개념 활용"], null); // 빈칸
  assert.strictEqual(MC.baseRate(base, "응용"), 35);
  assert.strictEqual(MC.baseRate(PILOT, "응용"), null);
});

t("기준 파일 점검: 항목이 없으면 거부, 다른 규칙 버전이면 알림", () => {
  assert.throws(() => MC.checkBaseline({ name: "빈 파일" }));
  assert.strictEqual(MC.checkBaseline({ hapdap: 0.5 }).warning, "");
  assert.ok(MC.checkBaseline({ hapdap: 0.5 }).base.id);
  assert.ok(MC.checkBaseline({ hapdap: 0.5, made_with: "classify-v0" }).warning.includes("classify-v0"));
});

t("풀어 본 결과: 유형별 정답, 전체 %, 연습 안 한 유형", () => {
  const sum = MC.summarize(MC.parseAI(ai));                 // 개념 체크 5 + 서술형 1
  const base = MC.makeBaseline(MC.summarize(MC.parseAI(exam)), "테스트");
  const s = MC.score(sum.labels, { 1: true, 2: false, 3: true, 4: null, 5: false, 6: true }, base);
  assert.deepStrictEqual(s.byType["개념 체크"], { right: 2, total: 4 });
  assert.deepStrictEqual([s.right, s.total, s.percent], [3, 5, 60]);
  assert.deepStrictEqual(s.unpracticed, ["개념 활용", "응용"]);  // 기출에서 각각 20%, 40%
  assert.strictEqual(MC.score(sum.labels, {}, PILOT).percent, null);
});

t("다시 요청 문장: 기준 숫자가 들어간다", () => {
  const p = MC.retryPrompt(PILOT, "통합과학2 화학 변화");
  assert.ok(p.includes("통합과학2 화학 변화 단원 범위로"));
  assert.ok(p.includes(`${Math.round(PILOT.hapdap * 16)}문항 이상은 <보기>`));
  assert.ok(p.includes(`${Math.round(PILOT.dataOrCalc * 20)}문항 이상은 표, 그래프`));
  assert.ok(MC.retryPrompt(PILOT, "").includes("같은 범위로"));
  const full = MC.retryPrompt(MC.makeBaseline(MC.summarize(MC.parseAI(exam)), "x"), "");
  assert.ok(full.includes("난이도는 상 12문항, 중 8문항, 하 0문항 정도"));
});

console.log(`\n${n}개 통과`);
