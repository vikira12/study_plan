const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
let server;
let directory;
let address;
let revision = null;
const tasks = [1, 2, 3].map((number) => ({ id: `fictional-${number}`, title: `가상 과제 ${number}`,
  startDate: "2026-10-10", dueDate: "2026-10-11", reminderDays: 1, category: "study", completed: false, notifiedFor: null }));

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "study-planner-store-test-"));
  process.env.STUDY_PLANNER_DATA_FILE = path.join(directory, "tasks.json");
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  process.env.PORT = String(port);
  server = require("../server").server;
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

async function read() { return (await fetch(`${address}/api/tasks`)).json(); }
async function write(next, expectedRevision = revision) {
  const response = await fetch(`${address}/api/tasks`, { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks: next, expectedRevision }) });
  const data = await response.json();
  if (response.ok) revision = data.revision;
  return { status: response.status, data };
}

test("개인 일정 저장·삭제·충돌·백업 (사용자 데이터와 분리)", async (t) => {
  await t.test("저장 값이 없는 경우 빈 목록이며 GET은 파일을 만들지 않음", async () => {
    assert.deepEqual(await read(), { initialized: false, tasks: [], revision: null });
    await assert.rejects(fs.access(process.env.STUDY_PLANNER_DATA_FILE));
  });
  await t.test("세 일정 순서가 디스크 재읽기에서도 유지", async () => {
    assert.equal((await write(tasks)).status, 200);
    assert.deepEqual((await read()).tasks, tasks);
    assert.deepEqual(JSON.parse(await fs.readFile(process.env.STUDY_PLANNER_DATA_FILE)).tasks, tasks);
  });
  await t.test("완료와 가운데 일정 삭제 유지 및 이전 상태 백업", async () => {
    const next = [{ ...tasks[0], completed: true }, tasks[2]];
    assert.equal((await write(next)).status, 200);
    assert.deepEqual((await read()).tasks, next);
    const backups = await fs.readdir(path.join(directory, "backups"));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "backups", backups[0]))).tasks, tasks);
  });
  await t.test("오래된 창의 쓰기는 409로 거절하고 유지", async () => {
    const previous = await read();
    assert.equal((await write(tasks, "obsolete")).status, 409);
    assert.deepEqual(await read(), previous);
  });
  await t.test("빈 제목·외부 Origin은 거절", async () => {
    assert.equal((await write([{ ...tasks[0], title: "   " }])).status, 400);
    const response = await fetch(`${address}/api/tasks`, { headers: { Origin: "https://example.org" } });
    assert.equal(response.status, 403);
    const legacy = await fetch(`${address}/api/tasks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tasks: [] }) });
    assert.equal(legacy.status, 428);
  });
  await t.test("명시적인 전체 삭제를 저장하고 백업은 최대 10개", async () => {
    for (let index = 0; index < 12; index += 1) assert.equal((await write(index % 2 ? [] : tasks)).status, 200);
    assert.equal((await read()).tasks.length, 0);
    assert.equal((await fs.readdir(path.join(directory, "backups"))).length, 10);
  });
  await t.test("손상된 서버 파일은 쓰기로 덮어쓰지 않음", async () => {
    await fs.writeFile(process.env.STUDY_PLANNER_DATA_FILE, "broken-json");
    assert.equal((await fetch(`${address}/api/tasks`)).status, 500);
    assert.equal((await write(tasks)).status, 500);
    assert.equal(await fs.readFile(process.env.STUDY_PLANNER_DATA_FILE, "utf8"), "broken-json");
  });
});
