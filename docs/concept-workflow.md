# 검토용 원화 단계 · 0.2.0

장르 공통의 `concept-plan → 내장 도구로 생성 → concept-import → concept-verify` 흐름이다. 에이전트가 실제 프롬프트와 참조를 전달하는 handoff를 사용하며, 하네스 내부에 이미지 생성 API 클라이언트·키·결제·다운로드를 넣지 않는다. 코드만으로 그림을 자동 생성했다고 주장하지 않는다.

## 명령

게임별 `design/concepts/<id>.json`과 `design/decisions/`의 사용자 허용 기록을 먼저 작성한다. 도구 실행기/설치 경로는 기존 `configure`를 따른다.

```sh
node tools/design.mjs concept-plan <concept-id>
# 출력 ticket/prompt/imageReferences를 그대로 사용해 에이전트가 내장 imagegen을 호출
# 결과 PNG를 spec.output에 복사, 실제 출처/입출력 해시를 .receipt.json에 기록
node tools/design.mjs concept-import <concept-id> --ticket <plan-ticket>
node tools/design.mjs concept-verify <concept-id> --ticket <plan-ticket>
```

최초 계획 이전의 이미지에 맞춰 검증 규격을 사후 변경하면 안 된다. 입력이 바뀌면 새 ticket과 새 생성 기록이 필요하다. 실행기 릴리스도 ticket에 포함한다. 실제 예시는 Game_1의 `design/concepts/dos-map-styleframe-v1.json`, `v2.json`이다. 특정 지리/인물 개념은 코어에 포함되지 않는다. 테스트의 퍼즐 시안은 실제 생성물이 아닌 명시적인 합성 fixture다.

## 보관과 판정

`builds/design/concepts/<id>/<ticket>/plan.json`에 프롬프트·참조·허용 기록·릴리스·도구 해시를 보관한다. 원화는 `candidates/<image-sha>/candidate.png`, `generation-receipt.json`, 입력 스냅샷과 `report.json`으로 격리한다. 기존 원화나 실행 중 게임을 덮어쓰지 않는다.

- 기술 검사: PNG 서명/CRC/실제 decode, 사전에 정한 크기/화면 비율/알파, 이미지·프롬프트·출처의 해시 일치, 보관 파일 변조 여부.
- AI 출처: `ai=true`, `mode=built-in-tool`, `reproducible=false`, `productionApproved=false` 필수. 동일 프롬프트의 동일 이미지 재생성을 보장하지 않는다.
- 미술 판정: `pending-user-review`. 좋은 그림·고증·문자 정확도·실제 엔진 배치·권리 검토는 자동 승인하지 않는다.
- 반입: `productionEligible=false`. concept에는 approve/publish가 없다. 이미지 한 장을 `.kra/.pxo` 레이어 원본 또는 개별 런타임 자산 묶음으로 취급하지 않는다.

원화를 수정하면 새 concept ID로 관리하고 이전 이미지와 영수증을 참조한다. 원본을 덮어쓰거나 지난 생성 영수증을 최신 수정 상태로 바꾸지 않는다.

## 0.3.0의 게임용 후보 전환

concept 자체의 위 검토 전용 판정은 유지한다. 사용자 범위가 허용하면 별도 production 명세에 `ai=true`로 등록하고 [AI 제작 계약](ai-production.md)의 원본·프롬프트·참조·영수증·가공 이력·무료 비용·권리 근거를 추가한다. 과거 영수증에 비용 정보가 없으면 무료로 소급 가정하지 않는다. production build/verify/engine-check와 실제 화면 검토/승인을 새로 받아야 하며 `concept-publish`는 여전히 없다.

새 생성 작업은 실행 전에 비용 근거를 확인한다. 정책의 AI 허용은 무료 확인이나 생성 실행·참조 전송의 포괄 승인이 아니다. 비용을 알 수 없거나 과금이 필요하면 실행을 보류한다. 기존 concept 명세/영수증은 변경하지 않는다.

이 경로는 사용자 승인을 기록하는 로컬 협업 절차다. 로컬 파일을 수정할 수 있는 사용자를 인증하거나 악성 변조를 막는 서명 시스템은 아니다. 내장 도구의 사용량/계정 한도가 무료라는 보증도 아니다.

## 검증

2026-09-16: 기존 26개 + concept 10개 = 36개 테스트 통과, skip 0. 고정 버전 0.1.0/0.1.1은 보존했다. Game_1에서 실제 생성 PNG 2개도 import/verify했다. 생성 자체는 별도 내장 도구 2회이며, 하네스 API 호출 2회라는 뜻은 아니다.
