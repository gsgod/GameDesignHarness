# Game Design Harness · 0.3.0

무료·로컬 중심의 게임 디자인 **제작 관리 → 검증 → 승인 → 반입** 도구. 역사 게임 전용이 아니다. 현재 지원은 `pixel-2d` PNG와 `none` / `godot-4` 어댑터이며, 원화를 자동으로 그려 주는 생성 AI는 포함하지 않는다.

공개 저장소: [gsgod/GameDesignHarness](https://github.com/gsgod/GameDesignHarness). [MIT License](LICENSE). 독립 저장소로 clone해 게임 폴더와 나란히 `GameDesignHarness/`에 배치한다. 소유자와 명시적으로 쓰기 권한을 받은 협업자만 원본 저장소에 push할 수 있다.

0.3.0은 **AI 원화도 무료 비용 근거·출처·가공 이력을 보존하고 검증/사용자 승인 후 게임용 후보로 반입**할 수 있게 한다. `paidTools=false`, 하네스 자체 `network=false`는 유지한다. `generativeAI=true`는 생성 API 실행이나 유료 사용 허용이 아니다. 외부 제작 도구의 실제 결과를 검사하며 자동 원화 생성·결제·다운로드는 하지 않는다. [AI 제작 계약](docs/ai-production.md).

0.2.0에서 추가된 concept 경로는 계속 검토 전용이다. 기존 concept 기록을 승인으로 바꾸지 않고 새 production 후보에서 추가 근거와 검증을 받는다. 비AI 명세도 계속 지원한다. [원화 시안 작업 절차](docs/concept-workflow.md).

## 책임과 폴더

```text
Games/
  STEAM_DEVELOPMENT_RULES.md
  GameDesignHarness/
    core/              계약, 경로 안전성, 파이프라인
    adapters/          ImageMagick 및 Godot PNG 검사
    templates/         게임별 실행기
    tools/             릴리스 생성, 게임 연결
    tests/             일반 퍼즐 fixture 및 안전성 회귀 검사
    releases/0.3.0/    채택한 게임이 실행하는 고정 복사본 (이전 릴리스 보존)
  Game_1/
    design/            요구사항, 방향, 승인 증거, 버전 잠금
    art/source/        작업 원본과 PNG export
    builds/design/     계획, 후보, 원본 스냅샷, 검사/승인 기록
    game/assets/generated/<pack>/<run-hash>/  승인한 런타임 묶음
```

개발 소스를 수정해도 기존 릴리스와 Game_1은 바뀌지 않는다. 릴리스 파일 하나라도 달라지면 게임 실행기가 거부한다. 게임 실행·Steam 배포에는 하네스나 상위 폴더가 필요하지 않다. `publish`는 로컬 파일 복사이며 Steam 업로드나 UI 교체가 아니다.

## 시작

Node 22+와 ImageMagick 7을 별도로 설치한다. Godot 검사에는 Godot 4 실행 파일도 필요하다. 자동 다운로드, API, 네트워크 접근, 유료 도구 실행은 없다.

```sh
# 하네스에서: 새 버전 번호를 정한 뒤 한 번만 생성
node tools/release.mjs
# 같은 Games 폴더의 기존 게임에 연결. 기존 실행기/잠금을 덮어쓰지 않음.
node tools/connect.mjs ../NewGame 0.3.0
# 이후 게임 폴더에서
node tools/design.mjs configure --magick /absolute/path/to/magick --godot /absolute/path/to/Godot
node tools/design.mjs doctor
node tools/design.mjs plan
node tools/design.mjs build
node tools/design.mjs verify <run-hash>
node tools/design.mjs engine-check <run-hash>
```

`design/requirements.json` 예제는 [퍼즐 fixture](tests/pipeline.test.mjs)를, AI 제작 근거의 예제는 [생성 fixture](tests/generation.test.mjs)를 참고한다. 별도 게임 저장소 없이 계약을 확인할 수 있다. `plan`은 제작 지시·선택한 기술 스택·미작성 원본·라이선스 검토 대기를 `builds/design/plan.json`에 기록한다. `needs-artwork`는 정상적인 대기 상태이며 원화 완성이 아니다. 그런 상태의 `build`는 실패한다.

승인자는 contact sheet, 실제 게임 화면, 글자 가독성, 사용 권리를 확인하고 `design/reviews/`에 증거를 남긴 뒤 실행한다. 에이전트가 사용자 미술 승인을 대신 기록하면 안 된다.

```sh
node tools/design.mjs approve <run-hash> --reviewer "실제 승인자" --note "실제 화면과 명세를 확인한 구체적 승인 사유" --evidence design/reviews/approved-review.md
node tools/design.mjs publish <run-hash>
```

모든 `run-hash`는 `build` 출력의 64자리 값이다. 명령에 `<...>`를 문자 그대로 쓰지 않는다. 원본·요구사항·참조·도구·릴리스가 바뀌면 이전 승인으로 반입할 수 없다. 기존 배포 묶음은 덮어쓰지 않는다. 승인 기록은 로컬 작업 이력이지 사용자 인증이나 위변조 방지 서명 시스템이 아니다.

## 무료 도구 선택

| 용도 | 도구 | v0.1 연결 방식 |
| --- | --- | --- |
| 픽셀 원화, 스프라이트 | [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | MIT, 공식 무료 배포. `.pxo` 보관 후 수동 PNG export |
| 지도 회화, 대표 장면 | [Krita](https://krita.org/en/download/) | 공식 무료 다운로드. `.kra` 보관 후 수동 PNG export |
| 검사, contact sheet | [ImageMagick](https://imagemagick.org/license/) | 설치된 실행 파일에 고정 인수 전달 |
| 엔진 읽기 검사 | 프로젝트의 Godot 4 | 격리된 임시 프로젝트에서 PNG decode |

공식 자료 확인: 2026-09-16. 무료 도구와 콘텐츠 사용 권리는 별개다. 기존 환경에 포함된 생성 기능도 추가 비용이 없다는 근거를 확인해야 하며 API 키 불필요만으로 무료라 하지 않는다. 유료 구매·새 구독·종량제 API·비용 미확인 실행은 금지한다. 로컬 무료 생성 도구도 별도 설치/모델 다운로드를 자동 승인하지 않는다. 하네스가 외부 생성기까지 오프라인으로 만드는 것은 아니다.

## 검증 및 개선

```sh
# 환경에 맞는 실제 경로 사용; Godot 변수를 빼면 엔진 검사들은 명시적으로 skip
HARNESS_TEST_MAGICK=/absolute/path/to/magick HARNESS_TEST_GODOT=/absolute/path/to/Godot npm test
```

검사 범위: 입력 계약, 최대 크기·색 수·투명도·선택 팔레트·sprite grid, PNG decode, 출력 해시, 출처 기록, 승인 연동, 경로 이탈/심볼릭 링크/덮어쓰기 차단, 릴리스 변조, 비역사 장르 pipeline.

자동으로 판단하지 않는 것: 그림의 완성도, 역사 고증, 실제 한글 입력기, 실제 게임에서의 배치·키보드 포커스, Windows/Linux 실기기, 법적 사용 가능성. Godot 검사는 **PNG를 읽는지**만 확인하며 게임 화면이 잘 보인다는 뜻이 아니다.

후속 지원은 실제 필요가 생길 때 추가한다: 버전별 Pixelorama CLI export → atlas packing → 실제 장면 회귀 캡처 → 다른 2D/3D·엔진 어댑터. 장르 규칙은 프로젝트 `design/`에서 정의하고 공통 코어에 넣지 않는다. [계획 리뷰](docs/implementation-review.md), [계약·운영](docs/contract-and-operations.md).

상위 작업 폴더, 하네스, 게임은 독립 저장소로 관리한다. 하네스 저장소에는 소스·검증·불변 릴리스를 보관하고, 게임 데이터·원화·개인 도구 설정은 해당 게임에서 관리한다. Git에서 제외된 산출물은 별도로 백업한다. 실행 파일과 종속 라이브러리를 함께 배포하는 설치 패키지는 아직 없다.
