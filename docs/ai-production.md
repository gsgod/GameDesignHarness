# AI 에셋 제작·검증·승인 · 0.3.0

목표: 에이전트의 원화 생성 → 분리/편집 → 출처·품질·엔진 검증 → 사용자 승인 → 게임 반입. 무료 도구 조건과 개별 후보의 사용자 승인 절차를 유지한다. 이 문서는 장르 공통이며 실제 생성/승인 사실을 대신하지 않는다.

## 정책과 실행 범위

- production `policy`: `network=false`, `paidTools=false`, `generativeAI=true`로 AI 후보를 명시적으로 허용한다. false인 기존 비AI 계약도 지원한다.
- network=false는 하네스가 생성 API/결제/다운로드를 실행하지 않는다는 뜻이다. 에이전트의 내장 생성기/로컬 도구 사용은 해당 작업 승인과 실제 도구 가용성, 참조 전송 범위를 따른다. 외부 생성기를 오프라인이라고 표현하지 않는다.
- 새 그림 생성 **전에** 무료 또는 기존 제공 환경 내 추가 과금 없음의 근거를 확인한다. 종량제 API, 유료 도구 구매/새 구독, 자동 결제·충전·유료 전환, 비용 불명은 허용하지 않는다. API 키 불필요나 이번에 결제창이 뜨지 않았다는 사실만으로 무료 판정하지 않는다.
- 과거 concept 영수증은 비용을 증명하지 않는다. 추가 근거 없이는 production으로 넘어갈 수 없고, 과거 문서의 `productionEligible=false`/`productionApproved=false`도 바꾸지 않는다.

## 에셋 명세

일반 asset 필드와 `provenance.kind/creator/license/source/reviewed`는 유지한다. AI 후보는 `provenance.ai=true`, `sourceFormat=flat-png|layered-document`, `provenance.generation`을 추가한다. 상세 합성 예제는 `tests/generation.test.mjs`의 fixture이며 실제 생성 영수증/미술 승인으로 복사하지 않는다.

`sourceFormat=flat-png`이면 editable도 PNG이고 실제 decode/CRC/크기를 검사한다. source는 최종 게임용 PNG, editable은 현재 작업 원본 PNG이며 같아도 된다. 원 생성 이미지는 generation.original로 따로 보존한다. 평면 파일을 .kra/.pxo로 이름만 바꾸지 않는다.

`layered-document`는 실제 `.kra/.pxo/.ora/.xcf` 작업 원본을 보관하는 선언이다. PNG를 이름만 바꾼 경우는 차단하지만 이 버전이 native container/내부 레이어를 파싱하지는 않는다. 해당 편집기에서 열어 레이어와 export 대응을 확인하고 권리/미술 근거에 기록해야 한다. 자동 technical PASS를 편집층 존재 증명으로 표현하지 않는다.

## generation 필드

파일 근거는 모두 `{ "path": "프로젝트 상대 경로", "sha256": "실제 파일 SHA-256" }` 형태의 binding이다. 경로 탈출·심볼릭 링크·해시 불일치를 거부하며 프롬프트·허용·권리·비용 근거는 의미 있는 분량을 요구한다. 참조 파일의 내용 품질까지 자동 판정하지는 않는다.

| 필드 | 내용 |
| --- | --- |
| schema | 1 |
| generator / mode | 실제 도구 식별자 / built-in-tool 또는 local-tool |
| original | 원 생성 PNG, art/source/ 하위 |
| prompt | 실제 프롬프트, design/prompts/ 하위 |
| references | 실제 참조 binding 배열, design/ 하위, 최대 16개 |
| receipt | 실제 생성 기록 JSON, design/ 하위 |
| authorization | 사용 범위를 허용한 실제 기록, design/decisions/ 하위 |
| rights | 출처/사용 권리 검토 기록, design/reviews/ 하위 |
| processing | 원본→작업 원본→최종 PNG의 가공 기록 JSON, design/ 하위 |
| cost | 생성 도구의 비용 확인 객체 |

cost는 `status=free-local|included-no-extra-charge`, `paid=false`, `reviewed=true`, 실제 `checkedBy`, 날짜 `checkedAt`, `evidence` binding(design/decisions/)을 요구한다. paid/unknown/미검토/근거 누락은 차단한다. 이는 근거 보관/무결성 검사이지 과금 서버 조회나 청구액 보증이 아니다.

receipt는 `schema=1`, `ai=true`, 실제 `generator/mode`, original과 같은 `imageSha256`, prompt와 같은 `promptSha256`, `productionApproved=false`, 실제 `toolOutputFile/createdAt/note`를 기록한다. 기존 concept 영수증도 이 조건과 별도 비용 근거를 충족하면 참조할 수 있다. 영수증 자체에 미술 승인을 끼워 넣지 않는다.

processing은 `schema=1`, `ai=true`, 원본 `inputSha256`, 최종 PNG `outputSha256`, 작업 원본 `editableSha256`, `steps` 배열(1~32)을 기록한다. 각 step은 실제 `tool`, `operation`, 같은 형식의 `cost`를 가진다. 변경 없이 내보낸 경우도 그 사실을 기록한다. 중간 편집 도구의 비용도 검사한다. AI 기반 편집물의 ai=true를 유지한다.

## 검증과 반입

1. 작업 승인·비용 확인 후 도구로 제작하고 실제 입출력을 기록한다. 하네스는 직접 생성하지 않는다.
2. 별도 production 명세에 후보를 등록한다. 출처/권리 미검토나 파일 미준비는 완료가 아니다.
3. plan → build → verify → engine-check. 전이 참조(생성/가공/비용/권리 근거)까지 후보 sources와 입력 해시에 포함한다.
4. 실제 화면·미술·권리 검토와 후보별 사용자 승인 근거를 준비한다. PNG decode 성공은 인게임 품질 승인이 아니다.
5. 승인 지시가 있을 때 approve → publish. 미승인 publish는 차단한다. 입력·도구·릴리스·근거가 바뀌면 이전 승인으로 반입하지 않는다. publish 후 게임 렌더러 연결은 별도 구현이다.

로컬의 알려진 concept 영수증과 기존 AI run manifest, 현재 명세의 AI 원본/최종 이미지 해시를 비AI 선언과 비교한다. 같은 bytes를 이름만 바꾸거나 generation 필드를 지워 재분류하면 차단한다. 재인코딩된 이미지의 AI 탐지기나, 모든 로컬 이력/서류를 바꿀 수 있는 사용자에 대한 서명 보안은 아니다. 출처·비용·권리 기록은 사실대로 작성해야 한다.

기존 0.2.0 이하 릴리스·원화·concept 기록은 그대로 보존한다. 0.3.0 채택은 미술 승인/권리 확인/Steam 업로드 승인이 아니다.
