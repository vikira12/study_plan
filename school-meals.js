// 급식 조회는 개인 일정의 추가·완료·삭제 및 저장 흐름과 독립적으로 동작한다.
(() => {
  const wallpaper = document.documentElement.dataset.wallpaper === "true";
  const panel = document.querySelector(wallpaper ? "#wallpaper-meals" : "#school-meals");
  const input = document.querySelector("#meal-date");
  const status = document.querySelector(wallpaper ? "#wallpaper-meal-status" : "#meal-status");
  const list = document.querySelector(wallpaper ? "#wallpaper-meal-list" : "#meal-list");
  const dayLabel = document.querySelector(wallpaper ? "#wallpaper-meal-day" : "#meal-day-label");
  const local = ["127.0.0.1", "localhost", "::1"].includes(location.hostname) && location.protocol === "http:";
  let requestId = 0;
  let controller;
  let followToday = true;
  let previousToday = today();
  let lastShown = null;

  function today() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  }

  function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
      date >= input.min && date <= input.max;
  }

  function validMeals(meals) {
    return Array.isArray(meals) && meals.length <= 3 && new Set(meals.map((meal) => meal?.type)).size === meals.length &&
      meals.every((meal) => ["조식", "중식", "석식"].includes(meal.type) && typeof meal.calories === "string" &&
        Array.isArray(meal.menu) && meal.menu.length > 0 && meal.menu.every((item) => typeof item === "string" && item.trim()));
  }

  async function getJson(url, signal) {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("급식 서버 응답 오류");
    return response.json();
  }

  function renderMeals(meals) {
    list.replaceChildren();
    for (const type of ["조식", "중식", "석식"]) {
      const meal = meals.find((entry) => entry.type === type);
      const card = document.createElement("section");
      card.className = `meal-card meal-${type === "조식" ? "breakfast" : type === "중식" ? "lunch" : "dinner"}`;
      const heading = document.createElement("h3");
      heading.textContent = type;
      card.append(heading);
      const content = document.createElement("p");
      content.textContent = meal ? meal.menu.join("\n") : "등록된 식단 없음";
      card.append(content);
      if (meal?.calories) {
        const calories = document.createElement("small");
        calories.textContent = meal.calories;
        card.append(calories);
      }
      list.append(card);
    }
  }

  async function load() {
    const id = ++requestId;
    controller?.abort();
    controller = new AbortController();
    const attempt = controller;
    const signal = attempt.signal;
    const timer = setTimeout(() => attempt.abort(), 25_000);
    // 배경화면에서는 숨겨진 날짜 입력값과 관계없이 항상 한국 날짜의 오늘만 조회한다.
    const date = wallpaper ? today() : input.value;
    const retained = lastShown?.date === date;
    if (!retained) list.replaceChildren();
    dayLabel.textContent = "";
    panel.setAttribute("aria-busy", "true");
    try {
      if (!validDate(date)) {
        status.textContent = "2020~2100년 사이의 올바른 날짜를 선택해 주세요.";
        return;
      }
      dayLabel.textContent = `${wallpaper ? "오늘 · " : ""}${new Intl.DateTimeFormat("ko-KR", {
        timeZone: "UTC", month: "long", day: "numeric", weekday: "short",
      }).format(new Date(`${date}T00:00:00Z`))}`;
      if (location.protocol === "file:") {
        status.textContent = "급식표는 로컬 서버 또는 배포 주소로 접속하면 표시됩니다.";
        return;
      }
      status.textContent = "급식표를 불러오는 중…";
      let data;
      let deployed = !local;
      let fallback = false;
      if (local) {
        try {
          data = await getJson(`/api/school-meals?date=${date}`, signal);
          if (data.date !== date || !validMeals(data.meals)) throw new Error("급식 자료 형식 오류");
        } catch (error) {
          if (signal.aborted) throw error;
          fallback = true;
          deployed = true;
        }
      }
      if (deployed) {
        const snapshot = await getJson("data/meals.json", signal);
        if (id !== requestId) return;
        if (snapshot.school !== "대덕소프트웨어마이스터고등학교") throw new Error("다른 학교 자료");
        data = snapshot.days?.[date];
        if (!data) {
          if (retained) throw new Error("갱신 자료 없음");
          status.textContent = fallback
            ? "실시간 조회에 실패했고 이 날짜의 배포 자료도 없습니다. 다시 조회해 주세요."
            : "이 날짜의 급식 자료는 아직 배포되지 않았습니다. 학교 식단 원본을 확인해 주세요.";
          return;
        }
      }
      if (!validMeals(data?.meals) || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt))) {
        throw new Error("급식 자료 형식 오류");
      }
      if (id !== requestId) return;
      renderMeals(data.meals);
      lastShown = { date };
      const updated = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(data.updatedAt));
      const origin = fallback || data.stale ? "갱신 실패 · 저장된 자료" : deployed ? "배포 자료" : "나이스 공개 자료";
      status.textContent = `${data.meals.length ? origin : "등록된 급식이 없습니다 · " + origin} · ${updated} 갱신`;
    } catch {
      if (id === requestId) status.textContent = retained
        ? "급식 갱신 실패 · 마지막으로 확인한 이 날짜의 식단을 표시합니다."
        : "학교 급식표를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.";
    } finally {
      clearTimeout(timer);
      if (id === requestId) panel.setAttribute("aria-busy", "false");
    }
  }

  function shiftDate(offset) {
    if (!validDate(input.value)) return;
    const next = new Date(`${input.value}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + offset);
    const date = next.toISOString().slice(0, 10);
    if (!validDate(date)) return;
    input.value = date;
    followToday = date === today();
    load();
  }

  input.value = today();
  input.addEventListener("change", () => { followToday = input.value === today(); load(); });
  document.querySelector("#meal-previous").addEventListener("click", () => shiftDate(-1));
  document.querySelector("#meal-next").addEventListener("click", () => shiftDate(1));
  document.querySelector("#meal-today").addEventListener("click", () => { input.value = today(); followToday = true; load(); });
  document.querySelector("#meal-refresh").addEventListener("click", load);
  setInterval(() => {
    const current = today();
    if (previousToday !== current) {
      previousToday = current;
      if (followToday || wallpaper) { input.value = current; load(); }
    }
  }, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (wallpaper && !document.hidden) load();
  });
  setInterval(() => { if (wallpaper || !document.hidden) load(); }, 30 * 60_000);
  load();
})();
