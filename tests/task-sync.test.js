const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const syncSource = source.slice(source.indexOf("function loadTasks()"), source.indexOf('exportButton.addEventListener'));
const sample = [{ id: "fictional-1", title: "가상 복습 일정" }];

function fixture({ local = [], remote = sample, pending = false, base = "remote-v1", corrupt = false } = {}) {
  const storage = new Map([
    ["tasks", corrupt ? "invalid-json" : JSON.stringify(local)], ["marker", "yes"],
    ["pending", pending ? "yes" : "no"], ["base", base],
  ]);
  const writes = [];
  const context = vm.createContext({
    storageKey: "tasks", sharedMarkerKey: "marker", sharedPendingKey: "pending", sharedBaseKey: "base", sharedRecoveryKey: "recovery",
    tasks: [], wallpaperMode: false, sharedMode: true, sharedReady: false,
    sharedWrite: Promise.resolve(), sharedRevision: 0, sharedServerRevision: null, localReadFailed: false,
    storageMessage: { hidden: true, textContent: "" }, normalizeTask: (value) => value,
    readPreference: (key) => storage.get(key) ?? null, savePreference: (key, value) => storage.set(key, value),
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    AbortSignal, render() {},
    async fetch(url, options) {
      if (options.method === "PUT") {
        writes.push(JSON.parse(options.body));
        return { ok: true, status: 200, async json() { return { revision: "remote-v2" }; } };
      }
      return { ok: true, async json() { return { initialized: true, tasks: remote, revision: "remote-v1" }; } };
    },
  });
  vm.runInContext(syncSource, context);
  context.tasks = context.loadTasks();
  return { context, storage, writes };
}

test("초기 불러오기는 기존 서버 일정을 읽기만 한다", async () => {
  const page = fixture();
  await page.context.loadSharedTasks();
  await page.context.sharedWrite;
  assert.deepEqual(page.context.tasks, sample);
  assert.equal(page.writes.length, 0);
});

test("빈 목록에 남은 미전송 표시가 기존 일정을 삭제하지 않는다", async () => {
  const page = fixture({ pending: true });
  await page.context.loadSharedTasks();
  await page.context.sharedWrite;
  assert.deepEqual(page.context.tasks, sample);
  assert.equal(page.writes.length, 0);
  assert.equal(page.storage.get("recovery"), "[]");
});

test("손상된 브라우저 캐시로 서버를 덮어쓰지 않는다", async () => {
  const page = fixture({ corrupt: true, pending: true });
  await page.context.loadSharedTasks();
  assert.deepEqual(page.context.tasks, sample);
  assert.equal(page.writes.length, 0);
});

test("저장 기준이 바뀐 미전송 값은 별도로 보관한다", async () => {
  const local = [{ id: "fictional-2", title: "가상 과제" }];
  const page = fixture({ local, pending: true, base: "obsolete" });
  await page.context.loadSharedTasks();
  assert.deepEqual(page.context.tasks, sample);
  assert.deepEqual(JSON.parse(page.storage.get("recovery")), local);
  assert.equal(page.writes.length, 0);
});

test("서버 불러오기 이후 명시적 전체 삭제는 정상 저장한다", async () => {
  const page = fixture();
  await page.context.loadSharedTasks();
  page.context.saveTasks([]);
  await page.context.sharedWrite;
  assert.deepEqual(page.writes, [{ tasks: [], expectedRevision: "remote-v1" }]);
  assert.equal(page.storage.get("pending"), "no");
});

test("같은 기준의 미전송 변경은 정상 재전송한다", async () => {
  const local = [{ id: "fictional-1", title: "가상 변경" }];
  const page = fixture({ local, pending: true });
  await page.context.loadSharedTasks();
  await page.context.sharedWrite;
  assert.deepEqual(page.writes[0].tasks, local);
});

test("다른 창 변경 충돌 후에는 대기 중인 쓰기도 중단한다", async () => {
  const page = fixture();
  await page.context.loadSharedTasks();
  let requests = 0;
  page.context.fetch = async () => { requests += 1; return { ok: false, status: 409 }; };
  page.context.saveTasks(sample);
  page.context.saveTasks([]);
  await page.context.sharedWrite;
  assert.equal(requests, 1);
  assert.equal(page.context.sharedReady, false);
  assert.equal(page.storage.get("pending"), "yes");
});

test("이전 버전 서버에는 초기화나 변경을 자동 전송하지 않는다", async () => {
  const page = fixture();
  page.context.fetch = async () => ({ ok: true, async json() { return { initialized: true, tasks: sample }; } });
  await page.context.loadSharedTasks();
  assert.equal(page.context.sharedReady, false);
  assert.match(page.context.storageMessage.textContent, /최신 버전/);
});

test("첫 조회 도중 추가한 일정은 기존 서버 일정과 함께 저장한다", async () => {
  const page = fixture();
  let deliver;
  page.context.fetch = async (url, options) => {
    if (options.method === "PUT") {
      page.writes.push(JSON.parse(options.body));
      return { ok: true, status: 200, async json() { return { revision: "remote-v2" }; } };
    }
    return { ok: true, json: () => new Promise((resolve) => { deliver = resolve; }) };
  };
  const loading = page.context.loadSharedTasks();
  await new Promise((resolve) => setImmediate(resolve));
  const added = { id: "fictional-new", title: "가상 새 과제" };
  page.context.saveTasks([added]);
  deliver({ initialized: true, tasks: sample, revision: "remote-v1" });
  await loading;
  await page.context.sharedWrite;
  assert.deepEqual(page.writes[0].tasks, [added, ...sample]);
});
