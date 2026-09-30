const storageKey = "studyPlannerTasks";
const dayMilliseconds = 86_400_000;
const form = document.querySelector("#task-form");
const formHeading = document.querySelector("#form-heading");
const titleInput = document.querySelector("#task-title");
const dueInput = document.querySelector("#task-due");
const reminderInput = document.querySelector("#task-reminder");
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
const calendarMonth = document.querySelector("#calendar-month");
const previousMonthButton = document.querySelector("#previous-month");
const nextMonthButton = document.querySelector("#next-month");
const todayButton = document.querySelector("#today-button");

let tasks = [];
let editingId = null;
let canSave = true;
let viewedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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

function normalizeTask(value) {
  if (!value || typeof value !== "object") throw new Error("잘못된 일정 데이터");
  // 이전 버전의 날짜·시간 데이터는 날짜 부분만 이어서 사용한다.
  const dueDate = value.dueDate || (typeof value.dueAt === "string" ? value.dueAt.slice(0, 10) : "");
  const reminderDays = value.reminderDays || (value.reminderMinutes ? Math.max(1, Math.ceil(value.reminderMinutes / 1440)) : 1);
  if (typeof value.id !== "string" || typeof value.title !== "string" || !value.title.trim() ||
      !parseDate(dueDate) || ![1, 3, 7].includes(Number(reminderDays))) {
    throw new Error("잘못된 일정 데이터");
  }
  return {
    id: value.id,
    title: value.title.trim(),
    dueDate,
    reminderDays: Number(reminderDays),
    completed: value.completed === true,
    notifiedFor: typeof value.notifiedFor === "string" ? value.notifiedFor : null,
  };
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) throw new Error("일정 데이터 형식 오류");
    return saved.map(normalizeTask);
  } catch {
    canSave = false;
    storageMessage.hidden = false;
    storageMessage.textContent = "저장된 일정을 읽을 수 없습니다. 데이터를 보호하기 위해 변경을 중단했습니다. 브라우저 저장 공간을 확인해 주세요.";
    return [];
  }
}

function saveTasks(nextTasks) {
  if (!canSave) {
    formMessage.textContent = "저장된 일정 문제를 해결한 뒤 다시 시도해 주세요.";
    return false;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextTasks));
    tasks = nextTasks;
    storageMessage.hidden = true;
    return true;
  } catch {
    storageMessage.hidden = false;
    storageMessage.textContent = "일정을 저장하지 못했습니다. 브라우저 저장 공간이나 설정을 확인해 주세요.";
    return false;
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

function renderCalendar() {
  calendarGrid.replaceChildren();
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.max(35, Math.ceil((firstWeekday + daysInMonth) / 7) * 7);
  const today = todayNumber();
  calendarMonth.textContent = `${year}년 ${month + 1}월`;

  const tasksByDate = new Map();
  for (const task of tasks) {
    if (!tasksByDate.has(task.dueDate)) tasksByDate.set(task.dueDate, []);
    tasksByDate.get(task.dueDate).push(task);
  }

  for (let index = 0; index < cellCount; index += 1) {
    const date = new Date(year, month, index - firstWeekday + 1);
    const key = dateKey(date);
    const outside = date.getMonth() !== month;
    const isToday = dayNumber(parseDate(key)) === today;
    const cell = document.createElement("div");
    cell.className = `calendar-cell${outside ? " is-outside" : ""}${isToday ? " is-today" : ""}`;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", formatDate(key));

    const dateHeader = document.createElement("div");
    dateHeader.className = "calendar-date";
    const dayLabel = date.getDate() === 1 ? `${date.getMonth() + 1}월 ${date.getDate()}일` : String(date.getDate());
    if (dayNumber(parseDate(key)) >= today) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.textContent = dayLabel;
      addButton.setAttribute("aria-label", `${formatDate(key)}에 일정 추가`);
      addButton.addEventListener("click", () => {
        resetForm();
        dueInput.value = key;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        titleInput.focus();
      });
      dateHeader.append(addButton);
    } else {
      dateHeader.textContent = dayLabel;
    }
    cell.append(dateHeader);

    const events = document.createElement("div");
    events.className = "calendar-events";
    const dailyTasks = (tasksByDate.get(key) || []).slice().sort((a, b) => Number(a.completed) - Number(b.completed));
    for (const task of dailyTasks) {
      const state = deadlineState(task);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `calendar-event is-${state.kind}`;
      card.setAttribute("aria-label", `${task.title}, ${formatDate(key)}, ${state.label}. 수정하기`);
      const cardTitle = document.createElement("span");
      cardTitle.className = "calendar-event-title";
      cardTitle.textContent = task.title;
      const badge = document.createElement("span");
      badge.className = "calendar-event-badge";
      badge.textContent = state.kind === "urgent"
        ? (dayDifference(task.dueDate) === 0 ? "오늘 마감" : `D-${dayDifference(task.dueDate)}`)
        : state.kind === "overdue" ? "기한 지남" : state.kind === "complete" ? "완료" : "예정";
      card.append(cardTitle, badge);
      card.addEventListener("click", () => beginEdit(task));
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
    item.className = `task-item is-${state.kind}`;

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
    meta.textContent = `마감 ${formatDate(task.dueDate)} · ${task.reminderDays}일 전 알림`;
    const stateLabel = document.createElement("span");
    stateLabel.className = "task-state";
    stateLabel.textContent = state.label;
    details.append(title, meta, stateLabel);

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
}

function beginEdit(task) {
  editingId = task.id;
  titleInput.value = task.title;
  dueInput.value = task.dueDate;
  reminderInput.value = String(task.reminderDays);
  formHeading.textContent = "할 일 수정";
  submitButton.textContent = "수정 저장";
  cancelButton.hidden = false;
  formMessage.textContent = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  titleInput.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  const title = titleInput.value.trim();
  const dueDate = dueInput.value;
  const reminderDays = Number(reminderInput.value);

  if (!title) {
    formMessage.textContent = "일정 제목을 입력해 주세요.";
    titleInput.focus();
    return;
  }
  if (title.length > 100) {
    formMessage.textContent = "제목은 100자 이내로 입력해 주세요.";
    titleInput.focus();
    return;
  }
  if (!parseDate(dueDate) || dayDifference(dueDate) < 0) {
    formMessage.textContent = "오늘 또는 미래의 마감 날짜를 입력해 주세요.";
    dueInput.focus();
    return;
  }
  if (![1, 3, 7].includes(reminderDays)) {
    formMessage.textContent = "알림 기준을 다시 선택해 주세요.";
    reminderInput.focus();
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
      ? { ...task, title, dueDate, reminderDays, notifiedFor: task.dueDate === dueDate && task.reminderDays === reminderDays ? task.notifiedFor : null }
      : task);
    if (!saveTasks(next)) return;
  } else {
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title, dueDate, reminderDays, completed: false, notifiedFor: null,
    };
    if (!saveTasks([newTask, ...tasks])) return;
  }
  resetForm();
  render();
  titleInput.focus();
});

cancelButton.addEventListener("click", () => {
  resetForm();
  titleInput.focus();
});
statusFilter.addEventListener("change", renderTasks);
searchInput.addEventListener("input", renderTasks);
previousMonthButton.addEventListener("click", () => {
  viewedMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() - 1, 1);
  renderCalendar();
});
nextMonthButton.addEventListener("click", () => {
  viewedMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 1);
  renderCalendar();
});
todayButton.addEventListener("click", () => {
  const now = new Date();
  viewedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
});
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
render();
