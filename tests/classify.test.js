// 실행: node tests/classify.test.js   (설치할 것 없음)
const assert = require("assert");
const path = require("path");
global.window = {};
require(path.join(__dirname, "..", "samples.js"));
const MC = require(path.join(__dirname, "..", "classify.js"));
const { ai, exam } = window.SAMPLES;
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

t("비교: 예비 조사 요약 기준이면 닮은 정도가 낮고 부족한 점 문장이 나온다", () => {
  const sum = MC.summarize(MC.parseAI(ai));
  const cmp = MC.compare(sum, { hapdap: 0.80, dataOrCalc: 0.90 });
  assert.strictEqual(cmp.rows.length, 2);
  assert.strictEqual(cmp.similarity, 15);                   // 1 - (0.8 + 0.9)/2 = 0.15
  assert.ok(cmp.warn);
  assert.deepStrictEqual(cmp.shortages, ["기출보다 자료·계산 문제가 90%p 적어요.", "기출보다 합답형 문제가 80%p 적어요."]);
});

t("비교: 같은 세트끼리는 닮은 정도 100", () => {
  const items = MC.parseAI(exam);
  const base = MC.makeBaseline(items, "테스트");
  assert.strictEqual(MC.compare(MC.summarize(items), base).similarity, 100);
});

t("기준 만들기: 문항 원문 없이 비율과 평균 정답률만 담는다", () => {
  const items = MC.parseAI(exam);
  const base = MC.makeBaseline(items, "테스트", { 1: 40, 2: 30, 3: 70, 4: 60, 5: 20 });
  const text = JSON.stringify(base);
  assert.ok(!text.includes("산화된다") && !text.includes("stem"));
  assert.strictEqual(base.n, 5);
  assert.strictEqual(base.correctRate.type["응용"], 35);
  assert.strictEqual(base.correctRate.level["상"], 30);
});

t("다시 요청 문장: 기준 숫자가 들어간다", () => {
  const p = MC.retryPrompt(MC.summarize(MC.parseAI(ai)), { hapdap: 0.80, dataOrCalc: 0.90 }, { unit: "통합과학2 화학 변화" });
  assert.ok(p.includes("통합과학2 화학 변화 단원 범위로"));
  assert.ok(p.includes("13문항 이상은 <보기>"));           // 0.8 × 16
  assert.ok(p.includes("18문항 이상은 표, 그래프"));         // 0.9 × 20
});

console.log(`\n${n}개 통과`);
