const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../school-meals.js"), "utf8");

function fixture() {
  let clock = Date.parse("2026-10-10T14:00:00Z");
  let failure = false;
  const nodes = new Map();
  const intervals = new Map();
  const visibilityListeners = [];
  const requests = [];
  function node() {
    return { children: [], textContent: "", value: "", min: "2020-01-01", max: "2100-12-31",
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      setAttribute() {}, addEventListener() {} };
  }
  function query(selector) {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const document = { documentElement: { dataset: { wallpaper: "true" } }, hidden: true,
    querySelector: query, createElement: node,
    addEventListener(event, handler) { if (event === "visibilitychange") visibilityListeners.push(handler); } };
  vm.runInNewContext(source, { document, location: { hostname: "127.0.0.1", protocol: "http:" },
    Date: ClockDate, Intl, AbortController, URLSearchParams,
    setTimeout() { return 1; }, clearTimeout() {},
    setInterval(handler, duration) { intervals.set(duration, handler); },
    async fetch(url) {
      requests.push(url);
      if (failure) throw new Error("가상 연결 실패");
      const date = new URL(url, "http://127.0.0.1").searchParams.get("date");
      return { ok: true, async json() {
        return { date, updatedAt: new Date(clock).toISOString(), meals: [
          { type: "중식", menu: [`가상 식단 ${date}`], calories: "123 Kcal" },
        ] };
      } };
    } });
  return { nodes, intervals, document, requests, visibilityListeners,
    nextDay() { clock = Date.parse("2026-10-10T15:01:00Z"); },
    fail() { failure = true; } };
}

function settle() { return new Promise((resolve) => setImmediate(resolve)); }

test("배경화면 전용 영역에 한국 날짜의 오늘 급식 표시", async () => {
  const page = fixture();
  await settle();
  assert.equal(page.requests[0], "/api/school-meals?date=2026-10-10");
  const cards = page.nodes.get("#wallpaper-meal-list").children;
  assert.equal(cards.length, 3);
  assert.equal(cards[1].children[1].textContent, "가상 식단 2026-10-10");
  assert.equal(page.nodes.has("#meal-list"), false);
});

test("숨김 상태에서도 30분 갱신 및 배경화면 재개 때 재조회", async () => {
  const page = fixture();
  await settle();
  page.intervals.get(30 * 60_000)();
  await settle();
  assert.equal(page.requests.length, 2);
  page.document.hidden = false;
  page.visibilityListeners[0]();
  await settle();
  assert.equal(page.requests.length, 3);
});

test("한국 시간 자정 이후 자동으로 새 날짜의 식단 조회", async () => {
  const page = fixture();
  await settle();
  page.nextDay();
  page.intervals.get(60_000)();
  await settle();
  assert.equal(page.requests.at(-1), "/api/school-meals?date=2026-10-11");
  assert.equal(page.nodes.get("#wallpaper-meal-list").children[1].children[1].textContent, "가상 식단 2026-10-11");
});

test("같은 날짜 조회 실패 시 유지하되 다음 날에는 어제 식단 제거", async () => {
  const page = fixture();
  await settle();
  page.fail();
  page.intervals.get(30 * 60_000)();
  await settle();
  assert.equal(page.nodes.get("#wallpaper-meal-list").children.length, 3);
  assert.match(page.nodes.get("#wallpaper-meal-status").textContent, /마지막으로 확인한/);
  page.nextDay();
  page.intervals.get(60_000)();
  await settle();
  assert.equal(page.nodes.get("#wallpaper-meal-list").children.length, 0);
  assert.match(page.nodes.get("#wallpaper-meal-status").textContent, /불러오지 못했습니다/);
});
