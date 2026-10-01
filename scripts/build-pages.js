// GitHub Pages에는 서버가 없으므로 공개 일정을 정적 JSON으로 묶어 배포한다.
const fs = require("node:fs/promises");
const path = require("node:path");
const { holidaysForYear, schoolEventsForMonth, mergeSchoolEvents } = require("../server");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const snapshotPath = path.join(root, "data", "calendar.json");
const years = Array.from({ length: 3 }, (_, index) => new Date().getUTCFullYear() - 1 + index);

async function readSnapshot() {
  try {
    return JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  } catch {
    return null;
  }
}

async function build() {
  const previous = await readSnapshot();
  let holidays;
  let holidaysUpdatedAt;
  try {
    holidays = (await Promise.all(years.map(holidaysForYear))).flat();
    holidaysUpdatedAt = new Date().toISOString();
  } catch (error) {
    if (!Array.isArray(previous?.holidays)) throw error;
    console.warn(`공휴일 갱신 실패, 저장된 자료 사용: ${error.message}`);
    holidays = previous.holidays;
    holidaysUpdatedAt = previous.holidaysUpdatedAt;
  }

  let schoolEvents;
  let schoolUpdatedAt;
  try {
    const monthly = [];
    for (const year of years) {
      for (let month = 1; month <= 12; month += 1) {
        monthly.push(...await schoolEventsForMonth(year, month));
      }
    }
    schoolEvents = mergeSchoolEvents(monthly);
    schoolUpdatedAt = new Date().toISOString();
  } catch (error) {
    if (!Array.isArray(previous?.schoolEvents)) throw error;
    console.warn(`학교 일정 갱신 실패, 저장된 자료 사용: ${error.message}`);
    schoolEvents = previous.schoolEvents;
    schoolUpdatedAt = previous.schoolUpdatedAt;
  }

  const calendar = { years, holidaysUpdatedAt, schoolUpdatedAt, holidays, schoolEvents };
  await fs.mkdir(path.join(output, "data"), { recursive: true });
  await Promise.all(["index.html", "style.css", "app.js", "presentation.html"].map((file) =>
    fs.copyFile(path.join(root, file), path.join(output, file))));
  await fs.writeFile(path.join(output, "data", "calendar.json"), `${JSON.stringify(calendar)}\n`);
  if (process.argv.includes("--snapshot")) {
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, `${JSON.stringify(calendar)}\n`);
  }
  console.log(`배포 자료: 공휴일 ${holidays.length}개, 학교 일정 ${schoolEvents.length}개 (${years.join("~")})`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
