// 공개 급식만 배포한다. 개인 일정 파일은 읽지 않는다.
const fs = require("node:fs/promises");
const path = require("node:path");
const { schoolMealsForDate } = require("../server");

async function buildMealSnapshot(previous = null, today = new Date()) {
  const seoulDate = new Date(today.getTime() + 9 * 60 * 60_000);
  const year = seoulDate.getUTCFullYear();
  const month = seoulDate.getUTCMonth();
  const dates = [];
  // 이전·이번·다음 달: 월 경계를 넘어도 급식을 볼 수 있다.
  const end = Date.UTC(year, month + 2, 1);
  for (let time = Date.UTC(year, month - 1, 1); time < end; time += 86400000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  const days = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < dates.length) {
      const date = dates[cursor++];
      try {
        const data = await schoolMealsForDate(date);
        days[date] = { meals: data.meals, updatedAt: data.updatedAt };
      } catch (error) {
        if (previous?.days?.[date]) days[date] = previous.days[date];
        console.warn(`급식 ${date} 갱신 실패${days[date] ? ", 이전 자료 사용" : ", 미수록"}: ${error.message}`);
      }
    }
  }));
  if (!Object.keys(days).length) throw new Error("급식 자료를 하나도 가져오지 못했습니다.");
  return { school: "대덕소프트웨어마이스터고등학교", generatedAt: new Date().toISOString(), days };
}

if (require.main === module) {
  (async () => {
    const target = path.resolve(__dirname, "../data/meals.json");
    let previous = null;
    try { previous = JSON.parse(await fs.readFile(target, "utf8")); } catch { /* 첫 생성 */ }
    const data = await buildMealSnapshot(previous);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(data)}\n`);
    console.log(`급식 스냅샷: ${Object.keys(data.days).length}일`);
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { buildMealSnapshot };
