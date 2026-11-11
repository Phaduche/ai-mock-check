/* 기출로 기준 만들기 화면. 분류는 점검표와 같은 규칙(classify.js)을 쓰고, 손으로 바꾸지 않는다. */
(function () {
  "use strict";
  const { $, labelCells, fmtDist, pct, parseOrError } = UI;
  let sum = null, base = null;

  // 정답률만 다시 계산한다 (유형·난이도 비율은 정답률과 관계없음). 화면의 JSON 이 곧 내려받는 파일이다.
  function updateRates() {
    const rates = {};
    $("rows").querySelectorAll("input[data-id]").forEach(x => rates[x.dataset.id] = x.value);
    const withRates = MC.makeBaseline(sum, $("name").value, rates);
    base = Object.assign(withRates, { id: base.id });   // 처음 나눌 때 정한 id 를 유지
    $("json").textContent = JSON.stringify(base, null, 2);
  }

  $("go").onclick = () => {
    const parsed = parseOrError($("raw").value);
    $("err").textContent = parsed.error || "";
    if (parsed.error) return;
    sum = MC.summarize(parsed.items);
    $("rows").innerHTML = sum.labels.map((l, i) => `<tr>${labelCells(parsed.items[i], l)}<td><input type="text" data-id="${l.id}" style="width:60px"></td></tr>`).join("");
    base = MC.makeBaseline(sum, $("name").value, {});
    $("summary").textContent = `${sum.n}문항 · ` + MC.DIMS.map(d => d.single ? `${d.keys[0]} ${pct(sum[d.field])}` : `${d.name}: ${fmtDist(d.keys, sum[d.field], ", ")}`).join(" · ");
    $("out").classList.remove("hidden");
    updateRates();
  };
  $("rows").oninput = updateRates;
  $("name").oninput = () => { if (base) updateRates(); };
  $("sample").onclick = () => { $("raw").value = window.SAMPLES.exam; if (!$("name").value) $("name").value = "[예시] 기출 형식 5문항"; };
  $("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([$("json").textContent], { type: "application/json" })); a.download = "baseline.json";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
