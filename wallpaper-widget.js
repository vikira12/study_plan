// 배경화면 달력의 배치만 바꾼다. 일정 데이터와 수정 기능은 app.js가 관리한다.
(() => {
  if (document.documentElement.dataset.wallpaper !== "true") return;
  const frame = document.querySelector(".page");
  const toolbar = document.querySelector(".calendar-toolbar");
  const cacheKey = "studyPlannerWallpaperLayout";
  const local = ["127.0.0.1", "localhost", "::1"].includes(location.hostname) && location.protocol === "http:";
  let rect;
  let locked = false;
  let gesture = null;
  let changed = false;
  let writes = Promise.resolve();
  let revision = 0;

  const controls = document.createElement("div");
  controls.className = "wallpaper-widget-controls";
  const lockButton = document.createElement("button");
  lockButton.type = "button";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "배치 초기화";
  const status = document.createElement("span");
  status.className = "wallpaper-layout-status";
  status.setAttribute("role", "status");
  controls.append(status, lockButton, resetButton);
  toolbar.append(controls);
  toolbar.title = "상단을 드래그해 이동 · 테두리를 드래그해 크기 조절";

  function bounds() {
    return { width: Math.max(1, innerWidth), height: Math.max(1, innerHeight) };
  }

  function fit(value) {
    const viewport = bounds();
    const width = Math.max(Math.min(420, viewport.width), Math.min(value.width, viewport.width));
    const height = Math.max(Math.min(300, viewport.height), Math.min(value.height, viewport.height));
    return {
      left: Math.max(0, Math.min(value.left, viewport.width - width)),
      top: Math.max(0, Math.min(value.top, viewport.height - height)), width, height,
    };
  }

  function defaults() {
    const viewport = bounds();
    const width = Math.min(980, viewport.width * 0.72);
    const height = Math.min(640, viewport.height * 0.82);
    return fit({ left: viewport.width - width - 24, top: 24, width, height });
  }

  function apply(value) {
    rect = fit(value);
    for (const key of ["left", "top", "width", "height"]) frame.style[key] = `${rect[key]}px`;
    frame.style.setProperty("--wallpaper-card-height", `${Math.max(22, Math.min(30, rect.height / 20))}px`);
    frame.dataset.locked = String(locked);
    lockButton.textContent = locked ? "배치 잠금 해제" : "배치 잠금";
    lockButton.setAttribute("aria-pressed", String(locked));
  }

  function serialize() {
    const viewport = bounds();
    return { left: rect.left / viewport.width, top: rect.top / viewport.height,
      width: rect.width / viewport.width, height: rect.height / viewport.height, locked };
  }

  function restore(value) {
    if (!value || !["left", "top", "width", "height"].every(key =>
      typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1) ||
      value.width <= 0 || value.height <= 0 || typeof value.locked !== "boolean") return false;
    const viewport = bounds();
    locked = value.locked;
    apply({ left: value.left * viewport.width, top: value.top * viewport.height,
      width: value.width * viewport.width, height: value.height * viewport.height });
    return true;
  }

  function save() {
    const layout = serialize();
    const current = ++revision;
    changed = true;
    try { localStorage.setItem(cacheKey, JSON.stringify(layout)); } catch { /* 로컬 서버에도 저장한다. */ }
    if (!local) return;
    status.textContent = "저장 중…";
    writes = writes.catch(() => {}).then(async () => {
      const response = await fetch("/api/wallpaper-layout", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("배치 저장 실패");
      if (current === revision) status.textContent = "";
    }).catch(() => {
      if (current === revision) status.textContent = "배치 저장 실패 · 서버 확인";
    });
  }

  function begin(event, edge) {
    if (locked || gesture || event.button !== 0) return;
    if (!edge && event.target.closest("button, a, input, select")) return;
    event.preventDefault();
    changed = true;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, original: { ...rect }, edge,
      target: event.currentTarget };
    gesture.target.setPointerCapture(event.pointerId);
    frame.classList.add("is-positioning");
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const viewport = bounds();
    const { original, edge } = gesture;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!edge) {
      apply({ ...original, left: original.left + dx, top: original.top + dy });
      return;
    }
    const minWidth = Math.min(420, viewport.width);
    const minHeight = Math.min(300, viewport.height);
    let left = original.left, top = original.top;
    let right = original.left + original.width, bottom = original.top + original.height;
    if (edge.includes("w")) left = Math.max(0, Math.min(original.left + dx, right - minWidth));
    if (edge.includes("e")) right = Math.min(viewport.width, Math.max(right + dx, left + minWidth));
    if (edge.includes("n")) top = Math.max(0, Math.min(original.top + dy, bottom - minHeight));
    if (edge.includes("s")) bottom = Math.min(viewport.height, Math.max(bottom + dy, top + minHeight));
    apply({ left, top, width: right - left, height: bottom - top });
  }

  function finish(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (event.type === "pointerup") move(event);
    const ended = gesture;
    gesture = null;
    if (ended.target.hasPointerCapture(ended.id)) ended.target.releasePointerCapture(ended.id);
    frame.classList.remove("is-positioning");
    if (event.type === "pointercancel") apply(ended.original);
    else save();
  }

  toolbar.addEventListener("pointerdown", event => begin(event, ""));
  for (const edge of ["n", "s", "w", "e", "nw", "ne", "sw", "se"]) {
    const handle = document.createElement("div");
    handle.className = `wallpaper-resize wallpaper-resize-${edge}`;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => begin(event, edge));
    frame.append(handle);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  lockButton.addEventListener("click", () => { locked = !locked; apply(rect); save(); });
  resetButton.addEventListener("click", () => { locked = false; apply(defaults()); save(); });
  window.addEventListener("resize", () => {
    if (gesture) {
      const ended = gesture;
      gesture = null;
      if (ended.target.hasPointerCapture(ended.id)) ended.target.releasePointerCapture(ended.id);
      frame.classList.remove("is-positioning");
    }
    apply(rect);
  });

  apply(defaults());
  try { restore(JSON.parse(localStorage.getItem(cacheKey))); } catch { /* 기본 배치 유지 */ }
  if (local) {
    fetch("/api/wallpaper-layout", { cache: "no-store", signal: AbortSignal.timeout(5000) })
      .then(async response => {
        if (!response.ok) throw new Error("배치 읽기 실패");
        const data = await response.json();
        if (!changed && data.layout !== null && !restore(data.layout)) throw new Error("배치 형식 오류");
      }).catch(() => { status.textContent = "저장된 배치를 불러오지 못했습니다."; });
  }
})();
