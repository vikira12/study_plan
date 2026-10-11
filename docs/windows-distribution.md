# Windows 설치판 배포

처음 사용하는 사람에게는 [Windows 사용 방법](user-guide.md)을 안내한다. **현재 GitHub Release에 설치 ZIP을 공개하지 않았으며**, 기존 로컬 ZIP은 마지막 저장 보호 수정 반영을 위해 다시 생성해야 한다. 아래 절차는 최신 소스로 만든 ZIP을 전달받았을 때의 사용 방법이다. 깨끗한 PC 설치·재부팅·Lively 적용 검증은 별도로 남아 있다.

## 받는 사람의 사용 순서

1. Windows 64비트 PC에 맞는 ZIP을 받는다. 일반 Intel/AMD PC는 `x64`, ARM Windows는 `arm64` 런타임 패키지를 사용한다. ARM에서 Lively 동작 여부는 별도 확인이 필요하다.
2. **모두 압축 풀기** 후 `StudyPlanner/설치.cmd`를 실행한다. ZIP 내부에서 실행하지 않는다. 관리자 권한과 별도 Node.js 설치는 필요 없다.
3. 설치 후 열린 안내 화면에서 **내 달력 열기**를 누른다. 다음부터 바탕화면 `Study Planner` 바로가기를 사용한다.
4. [Lively 공식 홈페이지](https://www.livelywallpaper.net/)에서 설치 후 URL `http://127.0.0.1:3000/wallpaper.html`을 배경화면으로 등록한다. Lively의 Windows 시작 시 실행도 켠다. 로그인 직후 연결 오류가 보이면 서버 준비 후 배경화면을 다시 불러온다.

웹 편집 주소는 항상 `http://127.0.0.1:3000/`이다. 개인 일정·학교 일정·공휴일·급식을 제공하며, 배경화면은 개인 일정 15초 갱신, 오늘 급식, 이동·크기 조절·배치 잠금을 지원한다. 다크 모드, 검색, 완료 표시, 날짜 드래그, 마감 안내와 내보내기/가져오기 등 기존 기능을 유지한다. Lively 설치·등록은 자동 처리하지 않는다.

## 제작자: ZIP 만들기

저장소에서 다음을 실행한다.

```powershell
node --test tests/*.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
# ARM Windows용 런타임을 묶을 때
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1 -Architecture arm64
```

`dist/windows/StudyPlanner-Windows-x64-날짜.zip`이 생성된다. 빌드 스크립트는 [공식 Node.js 배포](https://nodejs.org/en/download)에서 최신 v24 LTS ZIP을 받고 공식 SHA256 목록과 비교한 후 `node.exe`와 라이선스만 포함한다. 다운로드된 릴리스 버전, 원본 URL, 런타임 ZIP 체크섬, 포함 파일 체크섬은 `manifest.json`에 기록한다. 체크섬은 변조·손상 탐지용이며 설치 프로그램의 디지털 서명을 대신하지 않는다.

설치 파일은 UTF-8 BOM으로 묶어 Windows PowerShell 5.1에서도 한글 경로를 읽는다. 설치 스크립트는 모든 payload 체크섬과 필수 파일을 검사하고, 이미 존재하는 설치 폴더는 소유권 표식이 있을 때만 갱신한다. 다른 서버의 3000 포트 사용이나 같은 이름의 다른 바로가기는 자동 덮어쓰기/종료하지 않는다. ZIP과 `%LOCALAPPDATA%`의 개인 데이터는 Git에 올리지 않는다. 배포 ZIP은 사용자가 직접 전달하거나 검증 후 GitHub Release에 별도 게시한다. 이 작업은 Release 생성이나 푸시를 자동으로 수행하지 않는다.

공개 일정 스냅샷은 `data/calendar.json`, 급식은 `data/meals.json`만 포함한다. 필요하면 배포 직전 `node scripts/build-pages.js --snapshot`으로 공개 자료를 갱신한다. 소스·문서·테스트·개인 파일을 통째로 복사하지 않고 정해진 실행 파일만 복사한다. 학교 정보는 현재 대덕소프트웨어마이스터고로 고정되어 있다.

## 설치, 데이터와 제거

- 프로그램: `%LOCALAPPDATA%\Programs\StudyPlanner`.
- 개인 일정: `%LOCALAPPDATA%\StudyPlanner\tasks.json`. 변경 전 최근 10개 상태를 `backups/`에 보관한다. 자동 백업만 믿지 말고 웹의 **개인 일정 내보내기**도 사용한다.
- 배경화면 배치: 개인 데이터 폴더의 `wallpaper-layout.json`.
- 서버 자동 시작: 현재 사용자의 시작프로그램 `Study Planner Server.lnk`. Windows 로그인 후 실행되며 로그인 전 실행 서비스는 아니다.
- 업데이트: 새 ZIP을 풀어 `설치.cmd`를 실행한다. 앱 소유 서버만 종료 후 갱신하며 개인 데이터는 건드리지 않는다.
- 제거: 설치 폴더의 `제거.cmd`로 바로가기·자동 시작을 해제하고 앱 소유 서버를 종료한다. 안내된 프로그램 폴더만 직접 삭제한다. 개인 일정·백업은 유지되고 Lively 등록은 따로 해제한다.

기존 Pages 일정은 Pages에서 내보낸 후 로컬 웹에 가져온다. PC·Windows 계정·Pages 사이 자동 동기화는 없다. 다른 사람은 각자의 일정만 보며 제작자의 일정은 ZIP에 포함하지 않는다.

## 저장 장애 보호

초기 GET으로 읽은 서버 일정은 다시 PUT하지 않는다. 빈/손상된 캐시가 서버의 기존 일정을 삭제하지 못하게 하고, 다른 창이 먼저 수정한 경우 버전 충돌(409)로 쓰기를 중단한다. 미전송 값의 저장 기준이 맞지 않으면 서버 일정 우선으로 표시하고 브라우저 `studyPlannerLocalRecovery`에 이전 목록을 보관한다. 이 값은 개발자 도구의 Application → Local Storage에서 확인해 `{ "tasks": [...] }` 형식으로 내보낸 뒤 가져올 수 있다. 삭제 전체의 미전송 상태를 확실히 판별할 수 없는 경우는 기존 서버 일정을 보존한다.

자동 백업으로 복구하려면 서버를 종료하고 현재 `tasks.json`부터 별도로 복사한 뒤 원하는 백업을 `tasks.json`으로 복사하고 서버를 다시 실행한다. 손상된 서버 파일은 새 일정 저장으로 덮어쓰지 않는다. 이전에 발견한 일정 소실의 정확한 원인이나 이미 사라진 데이터의 복구를 보장하지는 않는다.

## 배포 전 실제 Windows 점검

- 깨끗한 PC에서 Node.js가 없어도 설치·바로가기 실행이 되는지 확인한다.
- ① 세 일정 추가, ② 완료 표시/해제, ③ 가운데 삭제, ④ 빈/공백 제목 차단, ⑤ 새로고침·창 재실행 상태 유지와 콘솔 오류 없음.
- 다른 브라우저와 Lively에서 같은 개인 일정이 보이는지, 학교·공휴일·오늘 급식이 나타나는지 확인한다.
- Lively 적용 후 위치·크기 변경, 잠금과 배치 복원, 읽기 전용을 확인한다.
- Windows 로그아웃/로그인 및 재부팅 후 서버 자동 시작과 Lively 연결을 확인한다.
- 업데이트·제거 후 개인 일정 유지, 다른 앱의 포트·바로가기 보호를 확인한다.
- 인터넷이 끊기거나 공개 API가 실패하면 안내와 스냅샷 대체 표시를 확인한다.

실제 깨끗한 PC 설치, 로그인/재부팅, Lively 적용 및 ARM 환경 점검은 자동 테스트만으로 대체할 수 없다. 서명되지 않은 설치 스크립트/ZIP에는 보안 경고나 조직 정책 차단이 있을 수 있으며, 백신이나 조직 정책을 해제하도록 요구하지 않는다. 앱을 닫은 동안 마감 알림을 보내지 않는다.
