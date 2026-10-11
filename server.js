// 의존성 없는 로컬 서버: 공개 일정과 이 PC의 개인 일정을 웹·배경화면에 제공한다.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const instance = createHash("sha256").update(root.toLowerCase()).digest("hex");
const taskStorePath = process.env.STUDY_PLANNER_DATA_FILE || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "StudyPlanner", "tasks.json");
let taskWrites = Promise.resolve();
const layoutStorePath = process.env.STUDY_PLANNER_LAYOUT_FILE || path.join(path.dirname(taskStorePath), "wallpaper-layout.json");
let layoutWrites = Promise.resolve();
const schoolUrl = "https://dsmhs.djsch.kr/scheduleH/list.do";
const schoolPage = "https://dsmhs.djsch.kr/scheduleH/list.do?m=0203&s=dsmhs";
const cache = new Map();
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/setup.html", ["setup.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/wallpaper.html", ["wallpaper.html", "text/html; charset=utf-8"]],
  ["/wallpaper-widget.js", ["wallpaper-widget.js", "text/javascript; charset=utf-8"]],
  ["/school-meals.js", ["school-meals.js", "text/javascript; charset=utf-8"]],
  ["/data/meals.json", ["data/meals.json", "application/json; charset=utf-8"]],
  ["/data/calendar.json", ["data/calendar.json", "application/json; charset=utf-8"]],
  ["/presentation.html", ["presentation.html", "text/html; charset=utf-8"]],
]);
const holidayTranslations = {
  "New Year's Day": "신정",
  "Lunar New Year": "설날 연휴",
  "Independence Movement Day": "삼일절",
  "Labour Day": "노동절",
  "Children's Day": "어린이날",
  "Buddha's Birthday": "부처님 오신 날",
  "Local Election Day": "지방선거",
  "Memorial Day": "현충일",
  "Constitution Day": "제헌절",
  "Liberation Day": "광복절",
  Chuseok: "추석 연휴",
  "National Foundation Day": "개천절",
  "Hangul Day": "한글날",
  "Christmas Day": "성탄절",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function validTask(task) {
  return task && typeof task === "object" &&
    typeof task.id === "string" && task.id.length > 0 && task.id.length <= 100 &&
    typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 100 &&
    validDate(task.startDate) && validDate(task.dueDate) &&
    task.startDate <= task.dueDate && [1, 3, 7].includes(task.reminderDays) &&
    ["study", "assignment", "review", "exam", "other"].includes(task.category) &&
    typeof task.completed === "boolean" &&
    (task.notifiedFor === null || typeof task.notifiedFor === "string");
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readTaskStore() {
  try {
    const raw = await fs.readFile(taskStorePath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tasks) || !data.tasks.every(validTask) || new Set(data.tasks.map((task) => task.id)).size !== data.tasks.length) throw new Error("개인 일정 파일 형식 오류");
    return { initialized: true, tasks: data.tasks, revision: createHash("sha256").update(raw).digest("hex") };
  } catch (error) {
    if (error.code === "ENOENT") return { initialized: false, tasks: [], revision: null };
    throw error;
  }
}

async function writeTaskStore(tasks, expectedRevision) {
  await fs.mkdir(path.dirname(taskStorePath), { recursive: true });
  const current = await readTaskStore();
  if (expectedRevision !== undefined && expectedRevision !== current.revision) {
    throw Object.assign(new Error("다른 창에서 일정이 변경되었습니다. 새로고침 후 다시 시도하세요."), { status: 409 });
  }
  if (current.initialized) {
    const backupDirectory = path.join(path.dirname(taskStorePath), "backups");
    await fs.mkdir(backupDirectory, { recursive: true });
    const backupName = `tasks-${Date.now()}-${current.revision}.json`;
    await fs.copyFile(taskStorePath, path.join(backupDirectory, backupName));
    const backups = (await fs.readdir(backupDirectory)).filter((name) => /^tasks-\d+-[a-f0-9]{64}\.json$/.test(name)).sort().reverse();
    for (const name of backups.slice(10)) await fs.unlink(path.join(backupDirectory, name));
  }
  const temporary = `${taskStorePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ tasks, updatedAt: new Date().toISOString() }), "utf8");
    await fs.rename(temporary, taskStorePath);
    return (await readTaskStore()).revision;
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readRequestJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1_000_000) throw Object.assign(new Error("요청이 너무 큽니다."), { status: 413 });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("JSON 형식이 올바르지 않습니다."), { status: 400 });
  }
}

function validLayout(layout) {
  return layout && ["left", "top", "width", "height"].every((key) =>
    typeof layout[key] === "number" && Number.isFinite(layout[key]) && layout[key] >= 0 && layout[key] <= 1) &&
    layout.width > 0 && layout.height > 0 && layout.left + layout.width <= 1.000001 &&
    layout.top + layout.height <= 1.000001 && typeof layout.locked === "boolean";
}

async function readLayout() {
  try {
    const data = JSON.parse(await fs.readFile(layoutStorePath, "utf8"));
    if (!validLayout(data.layout)) throw new Error("달력 배치 형식 오류");
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return { layout: null };
    throw error;
  }
}

async function writeLayout(layout) {
  await fs.mkdir(path.dirname(layoutStorePath), { recursive: true });
  const temporary = `${layoutStorePath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ layout }), "utf8");
    await fs.rename(temporary, layoutStorePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function fetchText(url, retries = 0) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`자료 제공처 응답 오류: ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= retries) throw error;
    }
  }
}

async function cached(key, duration, load) {
  const stored = cache.get(key);
  if (stored && Date.now() - stored.time < duration) return stored.value;
  try {
    const value = await load();
    cache.set(key, { time: Date.now(), value });
    return value;
  } catch (error) {
    if (stored) return stored.value;
    throw error;
  }
}

async function holidaysForYear(year) {
  return cached(`holidays-${year}`, 24 * 60 * 60 * 1000, async () => {
    const raw = JSON.parse(await fetchText(`https://date.nager.at/api/v4/Holidays/KR/${year}`));
    if (!Array.isArray(raw)) throw new Error("공휴일 자료 형식 오류");
    return raw.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.nationalHoliday !== false)
      .map((entry) => ({ date: entry.date, name: holidayTranslations[entry.name] || entry.name }));
  });
}

function decodeHtml(value) {
  return value.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity.startsWith("#")) {
      const code = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()] || match;
  });
}

const mealSource = "https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17320190722180924242823&infSeq=2";
const mealRequests = new Map();

function parseSchoolMeals(raw, date) {
  if (raw?.RESULT?.CODE === "INFO-200") return [];
  const blocks = raw?.mealServiceDietInfo;
  const head = blocks?.find((block) => Array.isArray(block.head))?.head;
  const rows = blocks?.find((block) => Array.isArray(block.row))?.row;
  const count = head?.find((entry) => "list_total_count" in entry)?.list_total_count;
  const result = head?.find((entry) => entry.RESULT)?.RESULT;
  // 인증키 없는 응답은 최대 5건이다. 날짜별 조회로 누락을 방지하고 총 건수도 검사한다.
  if (result?.CODE !== "INFO-000" || !Array.isArray(rows) || count !== rows.length || rows.length > 3) {
    throw new Error("급식 자료 형식 오류 또는 일부 메뉴 누락");
  }
  const types = { "1": "조식", "2": "중식", "3": "석식" };
  const seen = new Set();
  return rows.map((row) => {
    if (row.ATPT_OFCDC_SC_CODE !== "G10" || row.SD_SCHUL_CODE !== "7430310" ||
        row.MLSV_YMD !== date.replaceAll("-", "") || !types[row.MMEAL_SC_CODE] ||
        seen.has(row.MMEAL_SC_CODE) || typeof row.DDISH_NM !== "string") {
      throw new Error("학교 또는 날짜가 다른 급식 자료");
    }
    seen.add(row.MMEAL_SC_CODE);
    const menu = decodeHtml(row.DDISH_NM.replace(/<br\s*\/?\s*>/gi, "\n"))
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!menu.length) throw new Error("급식 메뉴가 비어 있습니다.");
    return { type: types[row.MMEAL_SC_CODE], menu, calories: typeof row.CAL_INFO === "string" ? row.CAL_INFO.trim() : "" };
  }).sort((a, b) => Object.values(types).indexOf(a.type) - Object.values(types).indexOf(b.type));
}

async function schoolMealsForDate(date) {
  if (!validDate(date) || Number(date.slice(0, 4)) < 2020 || Number(date.slice(0, 4)) > 2100) {
    throw new Error("급식 날짜가 올바르지 않습니다.");
  }
  const key = `meals-${date}`;
  const stored = cache.get(key);
  if (stored && Date.now() - stored.time < 30 * 60_000) return { ...stored.value, stale: false };
  if (mealRequests.has(date)) return mealRequests.get(date);
  const pending = (async () => {
    try {
      const url = new URL("https://open.neis.go.kr/hub/mealServiceDietInfo");
      url.search = new URLSearchParams({ Type: "json", ATPT_OFCDC_SC_CODE: "G10", SD_SCHUL_CODE: "7430310", MLSV_YMD: date.replaceAll("-", "") }).toString();
      const meals = parseSchoolMeals(JSON.parse(await fetchText(url, 1)), date);
      const value = { date, meals, updatedAt: new Date().toISOString(), source: mealSource };
      cache.set(key, { time: Date.now(), value });
      return { ...value, stale: false };
    } catch (error) {
      if (stored) return { ...stored.value, stale: true };
      throw error;
    } finally {
      mealRequests.delete(date);
    }
  })();
  mealRequests.set(date, pending);
  return pending;
}

function parseSchoolPage(html) {
  const events = [];
  const pattern = /<li id=['"]date(\d+)['"][^>]*>\s*<a[^>]*\bonClick="([^"]*)"[^>]*>(.*?)<\/a>\s*<\/li>/gis;
  for (const match of html.matchAll(pattern)) {
    const dates = match[2].match(/setData\(\s*'\d+'\s*,\s*'(\d{4}\/\d{2}\/\d{2})'\s*,\s*'(\d{4}\/\d{2}\/\d{2})'/);
    if (!dates) continue;
    const startDate = dates[1].replaceAll("/", "-");
    const dueDate = dates[2].replaceAll("/", "-");
    const visibleTitle = decodeHtml(match[3]).replace(/^\d+일\s*:\s*/, "").trim();
    const sourceTitle = match[2].match(/setData\(\s*'\d+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'([^']+)'/);
    const title = (visibleTitle || sourceTitle?.[1] || "").slice(0, 100);
    if (!title || title === "토요휴업일" || startDate > dueDate) continue;
    events.push({ id: `school-${match[1]}`, title, startDate, dueDate, source: "school" });
  }
  if (!events.length && /id=['"]date\d+['"]/.test(html)) throw new Error("학교 일정 형식이 변경되었습니다.");
  return events;
}

function semester(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month <= 2 ? `${year - 1}-2` : `${year}-${month <= 8 ? 1 : 2}`;
}

function mergeSchoolEvents(events) {
  const merged = [];
  const ordered = [...events].sort((a, b) => a.title.localeCompare(b.title, "ko") ||
    a.startDate.localeCompare(b.startDate) || a.dueDate.localeCompare(b.dueDate));
  for (const event of ordered) {
    const previous = merged.at(-1);
    if (previous?.title === event.title &&
        event.startDate <= new Date(Date.parse(`${previous.dueDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
      if (event.dueDate > previous.dueDate) previous.dueDate = event.dueDate;
    } else {
      merged.push({ ...event });
    }
  }
  return merged.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, "ko"));
}

async function schoolEventsForMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  first.setDate(1 - first.getDay());
  const last = new Date(year, month, 0);
  last.setDate(last.getDate() + 6 - last.getDay());
  const semesters = new Set([semester(first), semester(last)]);
  const pages = await Promise.all([...semesters].map((code) => cached(`school-${code}`, 30 * 60 * 1000, async () => {
    const [schoolYear, section] = code.split("-");
    const url = new URL(schoolUrl);
    url.searchParams.set("m", "0203");
    url.searchParams.set("s", "dsmhs");
    url.searchParams.set("schdYear", schoolYear);
    url.searchParams.set("section", section);
    return parseSchoolPage(await fetchText(url, 1));
  })));
  const from = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const seen = new Set();
  const unique = pages.flat().filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
  return mergeSchoolEvents(unique).filter((event) => event.startDate <= to && event.dueDate >= from);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/tasks" || url.pathname === "/api/wallpaper-layout") {
    const localAddress = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
    const localHost = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(request.headers.host);
    if (!localAddress || !localHost || (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)) {
      sendJson(response, 403, { error: "개인 일정은 이 PC에서만 접근할 수 있습니다." });
      return;
    }
    if (request.method !== "GET" && request.method !== "PUT") {
      sendJson(response, 405, { error: "GET 또는 PUT 요청만 지원합니다." });
      return;
    }
    try {
      if (url.pathname === "/api/wallpaper-layout") {
        await layoutWrites.catch(() => {});
        if (request.method === "GET") {
          sendJson(response, 200, await readLayout());
          return;
        }
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          sendJson(response, 415, { error: "JSON 요청만 지원합니다." });
          return;
        }
        const body = await readRequestJson(request);
        if (!validLayout(body?.layout)) {
          sendJson(response, 400, { error: "달력 위치 또는 크기가 올바르지 않습니다." });
          return;
        }
        layoutWrites = layoutWrites.catch(() => {}).then(() => writeLayout(body.layout));
        await layoutWrites;
        sendJson(response, 200, { saved: true });
        return;
      }
      await taskWrites.catch(() => {});
      if (request.method === "GET") {
        sendJson(response, 200, await readTaskStore());
        return;
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        sendJson(response, 415, { error: "JSON 요청만 지원합니다." });
        return;
      }
      const body = await readRequestJson(request);
      if (!Object.prototype.hasOwnProperty.call(body || {}, "expectedRevision")) {
        sendJson(response, 428, { error: "개인 일정 보호를 위한 버전 정보가 없습니다. 웹을 새로고침 후 다시 시도하세요." });
        return;
      }
      if (!Array.isArray(body?.tasks) || body.tasks.length > 1000 ||
          !body.tasks.every(validTask) || new Set(body.tasks.map((task) => task.id)).size !== body.tasks.length) {
        sendJson(response, 400, { error: "일정 데이터 형식이 올바르지 않습니다." });
        return;
      }
      taskWrites = taskWrites.catch(() => {}).then(() => writeTaskStore(body.tasks, body.expectedRevision));
      const revision = await taskWrites;
      sendJson(response, 200, { saved: true, revision });
    } catch (error) {
      console.error(url.pathname, error.message);
      sendJson(response, error.status || 500, { error: error.status ? error.message : "로컬 데이터를 저장하거나 읽지 못했습니다." });
    }
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "GET 요청만 지원합니다." });
    return;
  }
  if (url.pathname === "/api/health") {
    sendJson(response, 200, { app: "study-planner", status: "ok", instance });
    return;
  }
  if (url.pathname === "/api/school-meals") {
    const date = url.searchParams.get("date");
    if (!validDate(date) || Number(date.slice(0, 4)) < 2020 || Number(date.slice(0, 4)) > 2100) {
      sendJson(response, 400, { error: "급식 날짜가 올바르지 않습니다." });
      return;
    }
    try {
      sendJson(response, 200, await schoolMealsForDate(date));
    } catch (error) {
      console.error(url.pathname, error.message);
      sendJson(response, 502, { error: "학교 급식표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (url.pathname === "/api/holidays" || url.pathname === "/api/school-events") {
    if (!Number.isInteger(year) || year < 2020 || year > 2100 ||
        (url.pathname === "/api/school-events" && (!Number.isInteger(month) || month < 1 || month > 12))) {
      sendJson(response, 400, { error: "연도 또는 월이 올바르지 않습니다." });
      return;
    }
    try {
      const events = url.pathname === "/api/holidays" ? await holidaysForYear(year) : await schoolEventsForMonth(year, month);
      sendJson(response, 200, { events, source: url.pathname === "/api/holidays" ? "Nager.Date" : schoolPage });
    } catch (error) {
      console.error(url.pathname, error.message);
      sendJson(response, 502, { error: "외부 일정을 불러오지 못했습니다." });
    }
    return;
  }
  const file = files.get(url.pathname);
  if (!file) {
    sendJson(response, 404, { error: "페이지를 찾을 수 없습니다." });
    return;
  }
  try {
    const content = await fs.readFile(path.join(root, file[0]));
    response.writeHead(200, { "Content-Type": file[1], "X-Content-Type-Options": "nosniff" });
    response.end(content);
  } catch {
    sendJson(response, 500, { error: "파일을 읽지 못했습니다." });
  }
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`스터디 플래너: http://${host}:${port}`);
  });
}

module.exports = { holidaysForYear, schoolEventsForMonth, mergeSchoolEvents, schoolMealsForDate, parseSchoolMeals, server };
