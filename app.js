const storageKey = "studyPlannerTasks";
const dayMilliseconds = 86_400_000;
const form = document.querySelector("#task-form");
const formHeading = document.querySelector("#form-heading");
const titleInput = document.querySelector("#task-title");
const titleMessage = document.querySelector("#title-message");
const dueInput = document.querySelector("#task-due");
const startInput = document.querySelector("#task-start");
const reminderInput = document.querySelector("#task-reminder");
const categoryInput = document.querySelector("#task-category");
const formMessage = document.querySelector("#form-message");
const storageMessage = document.querySelector("#storage-message");
const submitButton = document.querySelector("#submit-button");
const cancelButton = document.querySelector("#cancel-button");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const taskCount = document.querySelector("#task-count");
const statusFilter = document.querySelector("#status-filter");
const searchInput = document.querySelector("#search-input");
const alertList = document.querySelector("#alert-list");
const alertSummary = document.querySelector("#alert-summary");
const notificationButton = document.querySelector("#notification-button");
const notificationStatus = document.querySelector("#notification-status");
const calendarGrid = document.querySelector("#calendar-grid");
const holidayStatus = document.querySelector("#holiday-status");
const schoolStatus = document.querySelector("#school-status");
const schoolEventList = document.querySelector("#school-event-list");
const schoolRefresh = document.querySelector("#school-refresh");
const calendarDragStatus = document.querySelector("#calendar-drag-status");
const calendarMonth = document.querySelector("#calendar-month");
const previousMonthButton = document.querySelector("#previous-month");
const nextMonthButton = document.querySelector("#next-month");
const todayButton = document.querySelector("#today-button");
const calendarSize = document.querySelector("#calendar-size");
const monthSummaryLabel = document.querySelector("#month-summary-label");
const monthTotal = document.querySelector("#month-total");
const monthPending = document.querySelector("#month-pending");
const monthCompleted = document.querySelector("#month-completed");
const monthProgress = document.querySelector("#month-progress");
const monthProgressLabel = document.querySelector("#month-progress-label");
const upcomingList = document.querySelector("#upcoming-list");
const themeToggle = document.querySelector("#theme-toggle");
const dateShortcuts = [...document.querySelectorAll(".date-shortcuts button")];
const viewSections = [...document.querySelectorAll("[data-view]")];
const navigationLinks = [...document.querySelectorAll("[data-nav]")];
const themeKey = "studyPlannerTheme";
const calendarSizeKey = "studyPlannerCalendarSize";
const categoryLabels = { study: "학습", assignment: "과제", review: "복습", exam: "시험", other: "기타" };
// 2026~2027년 대한민국 공휴일. 월력요항 및 2026년 공휴일 법령 개정 기준.
// https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026
// https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2027
// https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1018770105
const koreanHolidays = {
  2026: {
    "01-01": "신정", "02-16": "설날 연휴", "02-17": "설날", "02-18": "설날 연휴",
    "03-01": "삼일절", "03-02": "대체공휴일", "05-01": "노동절", "05-05": "어린이날",
    "05-24": "부처님 오신 날", "05-25": "대체공휴일", "06-03": "지방선거",
    "06-06": "현충일", "07-17": "제헌절", "08-15": "광복절", "08-17": "대체공휴일",
    "09-24": "추석 연휴", "09-25": "추석", "09-26": "추석 연휴",
    "10-03": "개천절", "10-05": "대체공휴일", "10-09": "한글날", "12-25": "성탄절",
  },
  2027: {
    "01-01": "신정", "02-06": "설날 연휴", "02-07": "설날", "02-08": "설날 연휴",
    "02-09": "대체공휴일", "03-01": "삼일절", "05-01": "노동절",
    "05-03": "대체공휴일", "05-05": "어린이날", "05-13": "부처님 오신 날",
    "06-06": "현충일", "07-17": "제헌절", "07-19": "대체공휴일",
    "08-15": "광복절", "08-16": "대체공휴일",
    "09-14": "추석 연휴", "09-15": "추석", "09-16": "추석 연휴",
    "10-03": "개천절", "10-04": "대체공휴일", "10-09": "한글날",
    "10-11": "대체공휴일", "12-25": "성탄절", "12-27": "대체공휴일",
  },
};
const liveHolidays = new Map();
let schoolEvents = [];
let calendarDataRequest = 0;
let staticCalendarPromise = null;

function holidayName(key) {
  return koreanHolidays[Number(key.slice(0, 4))]?.[key.slice(5)] || liveHolidays.get(key) || null;
}

function validCategory(value) {
  return Object.prototype.hasOwnProperty.call(categoryLabels, value);
}

let tasks = [];
let editingId = null;
let viewedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarDrag = null;
let suppressCalendarClick = false;

function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장할 수 없어도 현재 화면에서는 선택한 설정을 유지한다.
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "라이트 모드" : "다크 모드";
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

function applyCalendarSize(size) {
  document.documentElement.dataset.calendarSize = size;
  calendarSize.value = size;
}

function updateDateShortcuts() {
  for (const button of dateShortcuts) {
    const date = new Date();
    date.setDate(date.getDate() + Number(button.dataset.days));
    button.setAttribute("aria-pressed", String(dueInput.value === dateKey(date)));
  }
}

function resetDueDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dueInput.value = dateKey(tomorrow);
  startInput.value = dueInput.value;
  updateDateShortcuts();
}

function currentView() {
  const requested = new URLSearchParams(window.location.search).get("view");
  return ["calendar", "add", "tasks"].includes(requested) ? requested : "calendar";
}

function applyRoute() {
  const view = currentView();
  document.documentElement.dataset.page = view;
  for (const section of viewSections) section.hidden = section.dataset.view !== view;
  for (const link of navigationLinks) {
    if (link.dataset.nav === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `${view === "calendar" ? "달력" : view === "add" ? "일정 입력" : "내 일정"} | 스플`;

  if (view === "add") {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    const selectedDate = params.get("date");
    if (editId) {
      const task = tasks.find((entry) => entry.id === editId);
      if (task) populateEditForm(task);
      else {
        resetForm();
        formMessage.textContent = "수정할 일정을 찾지 못했습니다.";
      }
    } else {
      resetForm();
      if (parseDate(selectedDate) && dayDifference(selectedDate) >= 0) {
        dueInput.value = selectedDate;
        startInput.value = selectedDate;
        updateDateShortcuts();
      }
    }
  }
}

function goToView(view, parameters = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", view);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  try {
    window.history.pushState({}, "", url);
  } catch {
    window.location.assign(url.href);
    return;
  }
  applyRoute();
  window.scrollTo(0, 0);
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

function dayNumber(parts) {
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / dayMilliseconds);
}

function todayNumber() {
  const now = new Date();
  return dayNumber({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

function dayDifference(dueDate) {
  return dayNumber(parseDate(dueDate)) - todayNumber();
}

function formatDate(value) {
  const { year, month, day } = parseDate(value);
  return `${year}년 ${month}월 ${day}일`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftedDate(value, days) {
  const date = parseDate(value);
  if (!date) return null;
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  if (Number.isNaN(shifted.getTime()) || shifted.getUTCFullYear() > 9999) return null;
  const result = shifted.toISOString().slice(0, 10);
  return parseDate(result) ? result : null;
}

function normalizeTask(value) {
  if (!value || typeof value !== "object") throw new Error("잘못된 일정 데이터");
  // 이전 버전의 날짜·시간 데이터는 날짜 부분만 이어서 사용한다.
  const dueDate = value.dueDate || (typeof value.dueAt === "string" ? value.dueAt.slice(0, 10) : "");
  const startDate = parseDate(value.startDate) && value.startDate <= dueDate ? value.startDate : dueDate;
  const reminderDays = value.reminderDays || (value.reminderMinutes ? Math.max(1, Math.ceil(value.reminderMinutes / 1440)) : 1);
  if (typeof value.id !== "string" || typeof value.title !== "string" || !value.title.trim() ||
      !parseDate(dueDate) || ![1, 3, 7].includes(Number(reminderDays))) {
    throw new Error("잘못된 일정 데이터");
  }
  return {
    id: value.id,
    title: value.title.trim(),
    dueDate,
    startDate,
    reminderDays: Number(reminderDays),
    category: validCategory(value.category) ? value.category : "study",
    completed: value.completed === true,
    notifiedFor: typeof value.notifiedFor === "string" ? value.notifiedFor : null,
  };
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return [];
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) throw new Error("일정 데이터 형식 오류");
    return saved.map(normalizeTask);
  } catch {
    storageMessage.hidden = false;
    storageMessage.textContent = "저장된 일정을 읽을 수 없어 빈 목록으로 시작합니다. 새 일정은 다시 저장을 시도합니다.";
    return [];
  }
}

function saveTasks(nextTasks) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextTasks));
    tasks = nextTasks;
    storageMessage.hidden = true;
    return true;
  } catch {
    tasks = nextTasks;
    storageMessage.hidden = false;
    storageMessage.textContent = "브라우저에 저장하지 못했습니다. 현재 탭에서는 사용할 수 있지만 새로고침하면 일정이 사라질 수 있습니다.";
    return true;
  }
}

function deadlineState(task) {
  if (task.completed) return { label: "완료", kind: "complete" };
  const days = dayDifference(task.dueDate);
  if (days < 0) return { label: `기한 지남 · ${Math.abs(days)}일 경과`, kind: "overdue" };
  if (days === 0) return { label: "오늘 마감", kind: "urgent" };
  if (days <= task.reminderDays) return { label: `${days}일 남음 · 마감 임박`, kind: "urgent" };
  return { label: `${days}일 남음`, kind: "normal" };
}

function renderAlerts() {
  alertList.replaceChildren();
  const relevant = tasks.filter((task) => ["urgent", "overdue"].includes(deadlineState(task).kind));
  const urgentCount = relevant.filter((task) => deadlineState(task).kind === "urgent").length;
  const overdueCount = relevant.length - urgentCount;
  alertSummary.textContent = relevant.length
    ? `마감 임박 ${urgentCount}개 · 기한 경과 ${overdueCount}개`
    : "지금 확인할 마감 알림이 없습니다.";

  for (const task of relevant) {
    const item = document.createElement("li");
    const state = deadlineState(task);
    item.className = state.kind === "overdue" ? "is-overdue" : "";
    item.textContent = `${task.title} · ${state.label} (${formatDate(task.dueDate)})`;
    alertList.append(item);
  }
}

function makeButton(label, className, task, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", `${task.title} ${label}`);
  button.addEventListener("click", handler);
  return button;
}

function renderInsights() {
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth() + 1;
  const monthly = tasks.filter((task) => {
    const first = dateKey(new Date(year, month - 1, 1));
    const last = dateKey(new Date(year, month, 0));
    return task.startDate <= last && task.dueDate >= first;
  });
  const completed = monthly.filter((task) => task.completed).length;
  const percent = monthly.length ? Math.round(completed / monthly.length * 100) : 0;
  monthSummaryLabel.textContent = `${year}년 ${month}월 일정`;
  monthTotal.textContent = String(monthly.length);
  monthPending.textContent = String(monthly.length - completed);
  monthCompleted.textContent = String(completed);
  monthProgress.style.width = `${percent}%`;
  monthProgressLabel.textContent = `${percent}%`;
  monthProgress.parentElement.setAttribute("aria-valuenow", String(percent));

  upcomingList.replaceChildren();
  const upcoming = tasks.filter((task) => !task.completed && dayDifference(task.dueDate) >= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  if (!upcoming.length) {
    const empty = document.createElement("li");
    empty.className = "upcoming-empty";
    empty.textContent = "다가오는 일정이 없습니다.";
    upcomingList.append(empty);
    return;
  }
  for (const task of upcoming) {
    const item = document.createElement("li");
    item.className = `upcoming-item category-${task.category}`;
    const title = document.createElement("strong");
    title.textContent = task.title;
    const detail = document.createElement("span");
    detail.textContent = `${categoryLabels[task.category]} · ${formatDate(task.startDate)} ~ ${formatDate(task.dueDate)} · ${deadlineState(task).label}`;
    item.append(title, detail);
    upcomingList.append(item);
  }
}

function renderSchoolEvents() {
  schoolEventList.replaceChildren();
  const month = `${viewedMonth.getFullYear()}-${String(viewedMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthly = schoolEvents.filter((event) => event.startDate.slice(0, 7) <= month && event.dueDate.slice(0, 7) >= month);
  for (const event of monthly) {
    const item = document.createElement("li");
    const date = document.createElement("span");
    date.textContent = `${formatDate(event.startDate)}${event.dueDate !== event.startDate ? ` ~ ${formatDate(event.dueDate)}` : ""}`;
    const title = document.createElement("strong");
    title.textContent = event.title;
    item.append(date, title);
    schoolEventList.append(item);
  }
  if (!monthly.length && schoolStatus.dataset.loaded === "true") {
    const empty = document.createElement("li");
    empty.textContent = "이 달에 공개된 학교 일정이 없습니다.";
    schoolEventList.append(empty);
  }
  if (schoolStatus.dataset.loaded === "true") {
    schoolStatus.textContent = `선택한 달 행사 ${monthly.length}개 · 학교 공개 자료` +
      (schoolStatus.dataset.updatedAt ? ` · ${schoolStatus.dataset.updatedAt} 갱신` : "");
  }
}

async function requestCalendarData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("자료를 불러오지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    const error = new Error("일정 API가 없는 페이지입니다.");
    error.code = "missing-api";
    throw error;
  }
  const data = await response.json();
  if (!Array.isArray(data.events)) throw new Error("자료 형식이 올바르지 않습니다.");
  return data.events;
}

async function requestStaticCalendarData() {
  if (!staticCalendarPromise) {
    staticCalendarPromise = fetch("data/calendar.json").then(async (response) => {
      if (!response.ok) throw new Error("배포 자료를 읽을 수 없습니다.");
      const data = await response.json();
      if (!Array.isArray(data.holidays) || !Array.isArray(data.schoolEvents)) {
        throw new Error("배포 자료 형식이 올바르지 않습니다.");
      }
      return data;
    }).catch((error) => {
      staticCalendarPromise = null;
      throw error;
    });
  }
  return staticCalendarPromise;
}

async function showStaticCalendarData(requestId) {
  try {
    const data = await requestStaticCalendarData();
    if (requestId !== calendarDataRequest) return;
    for (const entry of data.holidays) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.name === "string") liveHolidays.set(entry.date, entry.name);
    }
    schoolEvents = data.schoolEvents.filter((entry) => entry.source === "school" && typeof entry.title === "string" &&
      parseDate(entry.startDate) && parseDate(entry.dueDate) && entry.startDate <= entry.dueDate);
    schoolStatus.dataset.loaded = "true";
    schoolStatus.dataset.updatedAt = data.schoolUpdatedAt?.slice(0, 10) || "";
    holidayStatus.textContent = `배포된 공휴일 자료를 표시합니다${data.holidaysUpdatedAt ? ` (${data.holidaysUpdatedAt.slice(0, 10)} 갱신)` : ""}. 임시공휴일은 빠질 수 있습니다.`;
    renderCalendar();
    renderSchoolEvents();
  } catch {
    if (requestId !== calendarDataRequest) return;
    holidayStatus.textContent = "배포 자료를 읽지 못했습니다. 2026~2027년은 저장된 공휴일을 표시합니다.";
    schoolStatus.textContent = "배포된 학교 일정 자료를 읽지 못했습니다. 나중에 새로고침해 주세요.";
  }
}

async function loadCalendarData() {
  const requestId = ++calendarDataRequest;
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth() + 1;
  schoolEvents = [];
  schoolStatus.dataset.loaded = "false";
  schoolStatus.dataset.updatedAt = "";
  schoolStatus.textContent = "학교 일정을 불러오는 중…";
  renderCalendar();
  renderSchoolEvents();
  if (location.protocol === "file:") {
    holidayStatus.textContent = "실시간 자료는 서버로 열 때 표시됩니다(2026~2027년은 저장된 공휴일 표시).";
    schoolStatus.textContent = "학교 일정은 `node server.js`로 실행하면 표시됩니다.";
    return;
  }
  if (location.hostname.endsWith(".github.io")) {
    await showStaticCalendarData(requestId);
    return;
  }

  const years = [year];
  if (month === 1) years.push(year - 1);
  if (month === 12) years.push(year + 1);
  const schoolResultPromise = requestCalendarData(`/api/school-events?year=${year}&month=${month}`)
    .then((events) => ({ events }), (error) => ({ error }));
  const holidayResults = await Promise.allSettled(years.map((item) => requestCalendarData(`/api/holidays?year=${item}`)));
  const loadedYears = holidayResults.filter((result) => result.status === "fulfilled");
  for (const result of loadedYears) {
    for (const entry of result.value) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date) && typeof entry.name === "string") liveHolidays.set(entry.date, entry.name);
    }
  }
  if (requestId !== calendarDataRequest) return;
  holidayStatus.textContent = loadedYears.length
    ? "공휴일 자료를 갱신했습니다. 임시공휴일은 제공처에 따라 빠질 수 있습니다."
    : "공휴일 갱신에 실패했습니다. 2026~2027년은 저장된 자료를 표시합니다.";
  renderCalendar();

  const schoolResult = await schoolResultPromise;
  if (requestId !== calendarDataRequest) return;
  if (!schoolResult.error) {
    schoolEvents = schoolResult.events.filter((entry) => entry.source === "school" && typeof entry.title === "string" &&
      parseDate(entry.startDate) && parseDate(entry.dueDate) && entry.startDate <= entry.dueDate);
    schoolStatus.dataset.loaded = "true";
    renderCalendar();
    renderSchoolEvents();
  } else {
    const error = schoolResult.error;
    if (error.status === 404 || error.code === "missing-api") {
      await showStaticCalendarData(requestId);
      return;
    }
    schoolStatus.textContent = error.status === 502
      ? "학교 사이트 응답이 없어 일정을 불러오지 못했습니다. 연결을 확인하고 다시 불러오기를 눌러 주세요."
      : "학교 일정 서버에 연결하지 못했습니다. 서버 실행 상태와 접속 주소를 확인해 주세요.";
  }
}

function previewCalendarDrag(drag) {
  for (const cell of calendarGrid.querySelectorAll(".calendar-cell")) {
    const key = cell.dataset.date;
    cell.classList.toggle("is-drag-preview", key >= drag.nextStart && key <= drag.nextDue);
  }
  calendarDragStatus.textContent = `${drag.task.title}: ${formatDate(drag.nextStart)} ~ ${formatDate(drag.nextDue)}`;
}

function calendarDateAt(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest(".calendar-cell")?.dataset.date || null;
}

function startCalendarDrag(event, task, date) {
  if (event.button !== 0 || calendarDrag) return;
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const position = event.clientX - bounds.left;
  const mode = date === task.startDate && position <= 15 ? "start"
    : date === task.dueDate && position >= bounds.width - 15 ? "end" : "move";
  calendarDrag = { pointerId: event.pointerId, task, anchor: date, mode, nextStart: task.startDate, nextDue: task.dueDate, changed: false };
  card.setPointerCapture(event.pointerId);
}

function updateCalendarCardCursor(event, task, date) {
  if (calendarDrag) return;
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const position = event.clientX - bounds.left;
  card.style.cursor = (date === task.startDate && position <= 15) ||
    (date === task.dueDate && position >= bounds.width - 15) ? "ew-resize" : "grab";
}

function updateCalendarDrag(event) {
  const drag = calendarDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const target = calendarDateAt(event.clientX, event.clientY);
  if (!target || !parseDate(target)) return;
  const delta = dayNumber(parseDate(target)) - dayNumber(parseDate(drag.anchor));
  let start = drag.task.startDate;
  let due = drag.task.dueDate;
  if (drag.mode === "move") {
    start = shiftedDate(start, delta);
    due = shiftedDate(due, delta);
  } else if (drag.mode === "start") {
    start = target > due ? due : target;
  } else {
    due = target < start ? start : target;
  }
  if (!start || !due || (start === drag.nextStart && due === drag.nextDue)) return;
  drag.nextStart = start;
  drag.nextDue = due;
  drag.changed = start !== drag.task.startDate || due !== drag.task.dueDate;
  previewCalendarDrag(drag);
}

function finishCalendarDrag(event) {
  if (event.type === "pointerup") updateCalendarDrag(event);
  const drag = calendarDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  calendarDrag = null;
  calendarGrid.querySelectorAll(".is-drag-preview").forEach((cell) => cell.classList.remove("is-drag-preview"));
  if (event.type === "pointercancel" || !drag.changed) {
    calendarDragStatus.textContent = "";
    return;
  }
  suppressCalendarClick = true;
  setTimeout(() => { suppressCalendarClick = false; }, 0);
  const next = tasks.map((task) => task.id === drag.task.id
    ? { ...task, startDate: drag.nextStart, dueDate: drag.nextDue, notifiedFor: task.dueDate === drag.nextDue ? task.notifiedFor : null }
    : task);
  saveTasks(next);
  render();
  calendarDragStatus.textContent = `${drag.task.title} 기간을 ${formatDate(drag.nextStart)}부터 ${formatDate(drag.nextDue)}까지로 변경했습니다.`;
}

function layoutWeekEvents(events) {
  const lanes = [];
  const rows = new Map();
  for (const event of events) {
    let lane = lanes.findIndex((items) => items.every((other) =>
      event.dueDate < other.startDate || event.startDate > other.dueDate));
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane].push(event);
    rows.set(event, lane + 1);
  }
  return { events, rows };
}

function renderCalendar() {
  calendarGrid.replaceChildren();
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.max(35, Math.ceil((firstWeekday + daysInMonth) / 7) * 7);
  const today = todayNumber();
  calendarMonth.textContent = `${year}년 ${month + 1}월`;

  const weeks = [];
  for (let start = 0; start < cellCount; start += 7) {
    const first = dateKey(new Date(year, month, start - firstWeekday + 1));
    const last = dateKey(new Date(year, month, start - firstWeekday + 7));
    const events = [...tasks, ...schoolEvents].filter((task) => task.startDate <= last && task.dueDate >= first)
      .sort((a, b) => Number(a.source === "school") - Number(b.source === "school") ||
        (a.source === "school" ?
          (dayNumber(parseDate(b.dueDate)) - dayNumber(parseDate(b.startDate))) -
          (dayNumber(parseDate(a.dueDate)) - dayNumber(parseDate(a.startDate))) : 0) ||
        Number(a.completed) - Number(b.completed) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    weeks.push(layoutWeekEvents(events));
  }

  for (let index = 0; index < cellCount; index += 1) {
    const date = new Date(year, month, index - firstWeekday + 1);
    const key = dateKey(date);
    const outside = date.getMonth() !== month;
    const isToday = dayNumber(parseDate(key)) === today;
    const holiday = holidayName(key);
    const weekday = date.getDay();
    const cell = document.createElement("div");
    const week = weeks[Math.floor(index / 7)];
    const dailyTasks = week.events.filter((task) => task.startDate <= key && task.dueDate >= key)
      .sort((a, b) => week.rows.get(a) - week.rows.get(b));
    cell.className = `calendar-cell${outside ? " is-outside" : ""}${isToday ? " is-today" : ""}${weekday === 0 ? " is-sunday" : weekday === 6 ? " is-saturday" : ""}${holiday ? " is-holiday" : ""}`;
    cell.dataset.date = key;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${formatDate(key)}${holiday ? `, ${holiday}` : weekday === 0 ? ", 일요일" : weekday === 6 ? ", 토요일" : ""}`);

    const dateHeader = document.createElement("div");
    dateHeader.className = "calendar-date";
    const dateMeta = document.createElement("span");
    dateMeta.className = "calendar-date-meta";
    if (holiday) {
      const label = document.createElement("span");
      label.className = "calendar-holiday-label";
      label.textContent = holiday;
      label.title = holiday;
      dateMeta.append(label);
    }
    if (dailyTasks.length) {
      const count = document.createElement("span");
      count.className = "calendar-day-count";
      count.textContent = `${dailyTasks.length}개`;
      dateMeta.append(count);
    }
    dateHeader.append(dateMeta);
    const dayLabel = date.getDate() === 1 ? `${date.getMonth() + 1}월 ${date.getDate()}일` : String(date.getDate());
    if (dayNumber(parseDate(key)) >= today) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = dayLabel;
      addButton.setAttribute("aria-label", `${formatDate(key)}에 일정 추가`);
      addButton.addEventListener("click", () => {
        goToView("add", { date: key });
        titleInput.focus();
      });
      dateHeader.append(addButton);
    } else {
      const number = document.createElement("span");
      number.textContent = dayLabel;
      dateHeader.append(number);
    }
    cell.append(dateHeader);

    const events = document.createElement("div");
    events.className = "calendar-events";
    for (const task of dailyTasks) {
      const isSchool = task.source === "school";
      if (isSchool) {
        const card = document.createElement("a");
        card.className = "calendar-event is-school";
        card.style.gridRow = String(week.rows.get(task));
        card.href = "https://dsmhs.djsch.kr/scheduleH/list.do?m=0203&s=dsmhs";
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.setAttribute("aria-label", `학교 일정 ${task.title}, ${formatDate(task.startDate)}부터 ${formatDate(task.dueDate)}까지. 학교 원본 보기`);
        const continuesBefore = task.startDate < key && index % 7 !== 0;
        const continuesAfter = task.dueDate > key && index % 7 !== 6;
        if (task.startDate !== task.dueDate) card.classList.add("is-range");
        if (continuesBefore) card.classList.add("continues-before");
        if (continuesAfter) card.classList.add("continues-after");
        if (!continuesBefore) {
          const title = document.createElement("span");
          title.className = "calendar-event-title";
          title.textContent = `학교 · ${task.title}`;
          card.append(title);
        }
        events.append(card);
        continue;
      }
      const state = deadlineState(task);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `calendar-event category-${task.category} is-${state.kind}`;
      card.style.gridRow = String(week.rows.get(task));
      const spansPreviousDay = task.startDate < key && index % 7 !== 0;
      const spansNextDay = task.dueDate > key && index % 7 !== 6;
      if (task.startDate !== task.dueDate) card.classList.add("is-range");
      if (spansPreviousDay) card.classList.add("continues-before");
      if (spansNextDay) card.classList.add("continues-after");
      card.setAttribute("aria-label", `${categoryLabels[task.category]} ${task.title}, ${formatDate(task.startDate)}부터 ${formatDate(task.dueDate)}까지, ${state.label}. 클릭하여 수정, 우클릭하여 완료 상태 변경, 드래그하여 이동`);
      const cardTitle = document.createElement("span");
      cardTitle.className = "calendar-event-title";
      cardTitle.textContent = task.title;
      const badge = document.createElement("span");
      badge.className = "calendar-event-badge";
      badge.textContent = state.kind === "urgent"
        ? (dayDifference(task.dueDate) === 0 ? "오늘 마감" : `D-${dayDifference(task.dueDate)}`)
        : state.kind === "overdue" ? "기한 지남" : state.kind === "complete" ? "완료" : "예정";
      const categoryBadge = document.createElement("span");
      categoryBadge.className = "calendar-category-badge";
      categoryBadge.textContent = categoryLabels[task.category];
      const badges = document.createElement("span");
      badges.className = "calendar-event-badges";
      badges.append(categoryBadge, badge);
      if (!spansPreviousDay) card.append(cardTitle);
      if (task.startDate === task.dueDate) card.append(badges);
      card.addEventListener("pointerdown", (event) => startCalendarDrag(event, task, key));
      card.addEventListener("pointermove", (event) => updateCalendarCardCursor(event, task, key));
      card.addEventListener("pointerleave", () => { card.style.cursor = "grab"; });
      card.addEventListener("click", () => {
        if (!suppressCalendarClick) beginEdit(task);
      });
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (calendarDrag) return;
        const completed = !task.completed;
        const next = tasks.map((entry) => entry.id === task.id ? { ...entry, completed } : entry);
        if (saveTasks(next)) {
          render();
          calendarDragStatus.textContent = `${task.title} 일정을 ${completed ? "완료" : "진행 중"} 상태로 변경했습니다.`;
        }
      });
      events.append(card);
    }
    cell.append(events);
    calendarGrid.append(cell);
  }
}

function renderTasks() {
  taskList.replaceChildren();
  const query = searchInput.value.trim().toLocaleLowerCase("ko-KR");
  const visible = tasks
    .filter((task) => statusFilter.value === "all" || (statusFilter.value === "completed") === task.completed)
    .filter((task) => task.title.toLocaleLowerCase("ko-KR").includes(query))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate));

  emptyState.hidden = visible.length > 0;
  emptyState.textContent = tasks.length === 0
    ? "등록된 일정이 없어요. 첫 할 일을 추가해 보세요."
    : "조건에 맞는 일정이 없습니다.";
  taskCount.textContent = `전체 ${tasks.length}개 · 진행 중 ${tasks.filter((task) => !task.completed).length}개`;

  for (const task of visible) {
    const state = deadlineState(task);
    const item = document.createElement("li");
    item.className = `task-item category-${task.category} is-${state.kind}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `${task.title} 완료 표시`);
    checkbox.addEventListener("change", () => {
      const next = tasks.map((entry) => entry.id === task.id ? { ...entry, completed: checkbox.checked } : entry);
      if (saveTasks(next)) render();
      else checkbox.checked = task.completed;
    });

    const details = document.createElement("div");
    details.className = "task-details";
    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;
    const meta = document.createElement("span");
    meta.className = "task-meta";
    meta.textContent = `${formatDate(task.startDate)} ~ ${formatDate(task.dueDate)} · ${task.reminderDays}일 전 알림`;
    const stateLabel = document.createElement("span");
    stateLabel.className = "task-state";
    stateLabel.textContent = state.label;
    const categoryLabel = document.createElement("span");
    categoryLabel.className = "task-category";
    categoryLabel.textContent = categoryLabels[task.category];
    details.append(title, meta, categoryLabel, stateLabel);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(
      makeButton("수정", "edit-button", task, () => beginEdit(task)),
      makeButton("삭제", "delete-button", task, () => {
        if (saveTasks(tasks.filter((entry) => entry.id !== task.id))) {
          if (editingId === task.id) resetForm();
          render();
        }
      }),
    );

    item.append(checkbox, details, actions);
    taskList.append(item);
  }
}

function updateNotificationStatus() {
  if (!("Notification" in window) || !window.isSecureContext) {
    notificationStatus.textContent = "이 환경에서는 브라우저 알림을 사용할 수 없습니다. 화면 알림은 계속 표시됩니다.";
    notificationButton.hidden = false;
    notificationButton.disabled = true;
  } else if (Notification.permission === "granted") {
    notificationStatus.textContent = "브라우저 알림이 켜져 있습니다.";
    notificationButton.hidden = true;
  } else if (Notification.permission === "denied") {
    notificationStatus.textContent = "브라우저 알림이 차단되었습니다. 브라우저 설정에서 변경할 수 있습니다.";
    notificationButton.hidden = false;
    notificationButton.disabled = true;
  } else {
    notificationStatus.textContent = "브라우저 알림을 원하면 버튼을 눌러 권한을 허용해 주세요.";
    notificationButton.hidden = false;
    notificationButton.disabled = false;
  }
}

function notifyDueTasks() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  for (const task of tasks) {
    if (deadlineState(task).kind !== "urgent") continue;
    const marker = `${task.dueDate}|${task.reminderDays}`;
    if (task.notifiedFor === marker) continue;
    try {
      new Notification("스플 · 마감 임박", { body: `${task.title} · ${deadlineState(task).label}` });
      if (!saveTasks(tasks.map((entry) => entry.id === task.id ? { ...entry, notifiedFor: marker } : entry))) {
        task.notifiedFor = marker;
      }
    } catch {
      notificationStatus.textContent = "브라우저 알림을 표시하지 못했습니다. 화면 알림을 확인해 주세요.";
      return;
    }
  }
}

function render() {
  renderCalendar();
  renderInsights();
  renderSchoolEvents();
  renderAlerts();
  renderTasks();
  updateNotificationStatus();
  notifyDueTasks();
}

function resetForm() {
  editingId = null;
  form.reset();
  formHeading.textContent = "할 일 추가";
  submitButton.textContent = "일정 추가";
  cancelButton.hidden = true;
  formMessage.textContent = "";
  titleMessage.textContent = "";
  titleInput.removeAttribute("aria-invalid");
  resetDueDate();
}

function populateEditForm(task) {
  editingId = task.id;
  titleInput.value = task.title;
  startInput.value = task.startDate;
  dueInput.value = task.dueDate;
  reminderInput.value = String(task.reminderDays);
  categoryInput.value = task.category;
  formHeading.textContent = "할 일 수정";
  submitButton.textContent = "수정 저장";
  cancelButton.hidden = false;
  formMessage.textContent = "";
  titleMessage.textContent = "";
  titleInput.removeAttribute("aria-invalid");
  updateDateShortcuts();
}

function beginEdit(task) {
  goToView("add", { edit: task.id });
  titleInput.focus();
}

titleInput.addEventListener("input", () => {
  if (titleInput.value.trim()) {
    titleMessage.textContent = "";
    titleInput.removeAttribute("aria-invalid");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  titleMessage.textContent = "";
  titleInput.removeAttribute("aria-invalid");
  const title = titleInput.value.trim();
  const startDate = startInput.value;
  const dueDate = dueInput.value;
  const reminderDays = Number(reminderInput.value);
  const category = categoryInput.value;

  if (!title) {
    titleMessage.textContent = "일정 제목을 입력해 주세요.";
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
    return;
  }
  if (title.length > 100) {
    titleMessage.textContent = "제목은 100자 이내로 입력해 주세요.";
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
    return;
  }
  if (!parseDate(dueDate) || dayDifference(dueDate) < 0) {
    formMessage.textContent = "오늘 또는 미래의 마감 날짜를 입력해 주세요.";
    dueInput.focus();
    return;
  }
  if (!parseDate(startDate) || startDate > dueDate) {
    formMessage.textContent = "시작 날짜는 마감 날짜와 같거나 그보다 앞서야 합니다.";
    startInput.focus();
    return;
  }
  if (![1, 3, 7].includes(reminderDays)) {
    formMessage.textContent = "알림 기준을 다시 선택해 주세요.";
    reminderInput.focus();
    return;
  }
  if (!validCategory(category)) {
    formMessage.textContent = "일정 유형을 다시 선택해 주세요.";
    categoryInput.focus();
    return;
  }

  if (editingId) {
    const current = tasks.find((task) => task.id === editingId);
    if (!current) {
      resetForm();
      formMessage.textContent = "수정할 일정을 찾지 못했습니다.";
      return;
    }
    const next = tasks.map((task) => task.id === editingId
      ? { ...task, title, startDate, dueDate, reminderDays, category, notifiedFor: task.dueDate === dueDate && task.reminderDays === reminderDays ? task.notifiedFor : null }
      : task);
    if (!saveTasks(next)) return;
  } else {
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title, startDate, dueDate, reminderDays, category, completed: false, notifiedFor: null,
    };
    if (!saveTasks([newTask, ...tasks])) return;
  }
  resetForm();
  statusFilter.value = "all";
  searchInput.value = "";
  render();
  goToView("tasks");
});

cancelButton.addEventListener("click", () => {
  resetForm();
  goToView("tasks");
});
dueInput.addEventListener("change", updateDateShortcuts);
for (const button of dateShortcuts) {
  button.addEventListener("click", () => {
    const date = new Date();
    date.setDate(date.getDate() + Number(button.dataset.days));
    dueInput.value = dateKey(date);
    startInput.value = dueInput.value;
    updateDateShortcuts();
    titleInput.focus();
  });
}
for (const link of navigationLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    goToView(link.dataset.nav);
  });
}
window.addEventListener("popstate", applyRoute);
window.addEventListener("pointermove", updateCalendarDrag);
window.addEventListener("pointerup", finishCalendarDrag);
window.addEventListener("pointercancel", finishCalendarDrag);
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  savePreference(themeKey, next);
});
calendarSize.addEventListener("change", () => {
  applyCalendarSize(calendarSize.value);
  savePreference(calendarSizeKey, calendarSize.value);
});
statusFilter.addEventListener("change", renderTasks);
searchInput.addEventListener("input", renderTasks);
previousMonthButton.addEventListener("click", () => {
  viewedMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() - 1, 1);
  loadCalendarData();
  renderInsights();
});
nextMonthButton.addEventListener("click", () => {
  viewedMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 1);
  loadCalendarData();
  renderInsights();
});
todayButton.addEventListener("click", () => {
  const now = new Date();
  viewedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  loadCalendarData();
  renderInsights();
});
schoolRefresh.addEventListener("click", loadCalendarData);
notificationButton.addEventListener("click", async () => {
  if (!("Notification" in window) || !window.isSecureContext) return;
  try {
    await Notification.requestPermission();
    updateNotificationStatus();
    notifyDueTasks();
  } catch {
    notificationStatus.textContent = "알림 권한을 요청하지 못했습니다. 화면 알림을 확인해 주세요.";
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
setInterval(render, 60_000);

tasks = loadTasks();
const preferredTheme = readPreference(themeKey);
const systemPrefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(preferredTheme === "dark" || (preferredTheme !== "light" && systemPrefersDark) ? "dark" : "light");
const preferredSize = readPreference(calendarSizeKey);
applyCalendarSize(["compact", "normal", "large"].includes(preferredSize) ? preferredSize : "compact");
dueInput.min = dateKey(new Date());
applyRoute();
render();
loadCalendarData();
