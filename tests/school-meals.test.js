const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSchoolMeals, schoolMealsForDate } = require("../server");

const date = "2026-10-10";
function row(type = "2", overrides = {}) {
  return { ATPT_OFCDC_SC_CODE: "G10", SD_SCHUL_CODE: "7430310", MLSV_YMD: "20261010",
    MMEAL_SC_CODE: type, DDISH_NM: "가상밥 (5)<br/>가상국 &amp; 반찬 (6)", CAL_INFO: "123 Kcal", ...overrides };
}
function response(rows, count = rows.length) {
  return { mealServiceDietInfo: [{ head: [{ list_total_count: count }, { RESULT: { CODE: "INFO-000" } }] }, { row: rows }] };
}

test("조식·중식·석식 순서, 전체 메뉴와 알레르기 번호 유지", () => {
  const meals = parseSchoolMeals(response([row("3"), row("1"), row("2")]), date);
  assert.deepEqual(meals.map((meal) => meal.type), ["조식", "중식", "석식"]);
  assert.deepEqual(meals[1].menu, ["가상밥 (5)", "가상국 & 반찬 (6)"]);
  assert.equal(meals[1].calories, "123 Kcal");
});
test("자료 없음과 API 오류를 구분", () => {
  assert.deepEqual(parseSchoolMeals({ RESULT: { CODE: "INFO-200" } }, date), []);
  assert.throws(() => parseSchoolMeals({ RESULT: { CODE: "ERROR-500" } }, date));
});
test("일부 응답만 온 경우 빈 목록으로 오인하지 않음", () => {
  assert.throws(() => parseSchoolMeals(response([row()], 6), date));
});
test("학교·날짜·급식 종류가 다른 자료 차단", () => {
  for (const overrides of [{ SD_SCHUL_CODE: "other" }, { ATPT_OFCDC_SC_CODE: "other" },
    { MLSV_YMD: "20261011" }, { MMEAL_SC_CODE: "4" }]) {
    assert.throws(() => parseSchoolMeals(response([row("2", overrides)]), date));
  }
});
test("중복 식단과 비어 있는 메뉴 차단", () => {
  assert.throws(() => parseSchoolMeals(response([row(), row()]), date));
  assert.throws(() => parseSchoolMeals(response([row("2", { DDISH_NM: "<br /> " })]), date));
});
test("잘못된 날짜는 외부 조회 전 거절", async () => {
  for (const invalid of ["2026-02-30", "2026-13-01", "2019-12-31", "2101-01-01", null]) {
    await assert.rejects(schoolMealsForDate(invalid));
  }
});
