// 의존성 없는 로컬 서버: 공개 공휴일·학교 학사일정을 받아 앱에 전달한다.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const schoolUrl = "https://dsmhs.djsch.kr/scheduleH/list.do";
const schoolPage = "https://dsmhs.djsch.kr/scheduleH/list.do?m=0203&s=dsmhs";
const cache = new Map();
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
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
  return pages.flat().filter((event) => {
    if (event.startDate > to || event.dueDate < from || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "GET 요청만 지원합니다." });
    return;
  }
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
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

server.listen(port, host, () => {
  console.log(`스터디 플래너: http://${host}:${port}`);
});
