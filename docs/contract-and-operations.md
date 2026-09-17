# v0.3 계약과 운영

## 요구사항

JSON schema 값은 1. `project/pack`은 소문자 ID, `profile=pixel-2d`, `engine=none|godot-4`. policy는 `network=false`, `paidTools=false`를 유지하며 `generativeAI`는 명시적 boolean이다. false인 기존 비AI 명세도 지원한다. true일 때도 AI 자산은 별도 [생성·무료 비용·출처 계약](ai-production.md)을 충족해야 한다. 빈 brief/visualReview는 거부한다. 참조는 게임의 `design/`에 둔다. network는 하네스 자체 API/다운로드 실행 범위이며 외부 생성기를 오프라인으로 보증하지 않는다.

asset 필수 필드: id, source(PNG), editable(편집 원본), width/height, alpha(opaque/transparent/any), maxColors, purpose, authoring, provenance(kind/creator/license/source/ai/reviewed). `pending` 또는 미검토 provenance는 빌드를 막는다. `project-original`은 내부 분류이지 공개 라이선스 부여가 아니다. 원본은 파일당 32 MiB 이하, PNG 한 장 4096px 이하·4MP 이하, 묶음 64장 이하. 큰 `.kra` 작업은 후속 대용량 원본 정책이 필요하다.

선택 grid.width/height는 스프라이트 시트 프레임 정렬을 확인하고 manifest에 보존한다. **프레임을 다시 packing하지 않는다.** 선택 palette는 불투명/반투명 픽셀의 RGB 허용 집합이다. PNG 투명 픽셀 RGB는 제외한다. PNG의 완전 투명/반투명 여부는 `transparent` 조건에서 구별하지 않는다. 알파 단계 제약이 필요하면 후속 validator를 추가한다.

## 단계

requirements + 원본 → plan → build(검사·원본 스냅샷·manifest·contact sheet) → verify → engine-check → 사람의 실제 화면 검토 → approve → publish.

`build`는 실행 시간 대신 입력 해시로 run ID를 정한다. 동일 입력은 검사 후 캐시 재사용한다. `partial-*`는 실패/중단 증거로 보존하고 다음 실행은 새 후보에서 재시도한다. `writer.lock`이 남았다면 PID가 정말 종료됐는지 먼저 확인하고 **해당 잠금 파일만** 별도 승인하여 제거한다. 자동 청소·재귀 삭제는 제공하지 않는다.

`configure`는 설치된 도구의 절대 경로, 실행 파일 SHA-256, 출력 버전, Node 버전을 `design/tools.local.json`에 기록한다. 명시적 로컬 도구 경로는 신뢰된 사용자 설정이다. 요구사항 파일에서 바이너리를 지정/설치/실행할 수 없다. 도구 업데이트 후 자동 수용하지 않고 `configure`를 다시 실행한다. 동적 링크 라이브러리까지 잠근 hermetic build는 아니다. 재현성 판단 시 OS/배포 패키지 및 라이브러리 차이를 추가 확인한다.

승인 증거 파일과 engine receipt가 달라져도 반입이 막힌다. 승인 JSON은 서명된 권한 토큰이 아니다. 이 도구와 폴더를 수정할 수 있는 로컬 사용자는 기록도 수정할 수 있다. 동시 악성 파일 교체에 대한 OS 수준 보안 샌드박스가 아니며, 버전/입력 오염과 실수 방지 목적이다.

## 릴리스 업그레이드

하네스 source 수정 → 테스트 → package.json 새 semver → `node tools/release.mjs`. 이미 있는 릴리스는 덮어쓰지 않는다. 각 게임에서 변경 내용을 검토한 뒤 기존 lock을 백업하고 새 version/manifestSha256으로 명시적으로 변경한다. 실행기 템플릿 변화도 개별 검토한다. 새 lock으로 plan/build/엔진/미술 승인 전체를 재검증한다. 이전 lock과 승인 asset pack은 보존해 되돌릴 수 있게 한다.

하네스 release에는 core/adapters/bin/package.json만 포함한다. 도구 원화·게임 데이터·개인 승인·내부 문서는 배포하지 않는다. 실제 게임에는 필요한 approved PNG와 manifest/승인 이력만 로컬 반입되며, 게임 UI는 그 manifest를 별도 명시적으로 채택해야 한다.
