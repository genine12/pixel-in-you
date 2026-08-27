# PIXEL IN YOU

우주 표류자가 매일 자신의 사진으로 지구의 신호를 복원해나가는 **개인용 포토모자이크 퍼즐 PWA**.
(기획: [PRD.md](PRD.md) · 디자인: [DESIGN.md](DESIGN.md) / Claude Design "Pixel In You 스페이스 콘솔")

## 기술 구성

- **프론트엔드**: 순수 HTML/CSS/JS (ES 모듈) — 빌드 단계 없음
- **백엔드**: Supabase (Auth · Postgres · Storage)
- **PWA**: `manifest.json` + `sw.js` (앱 셸 캐시, 홈 화면 설치 지원)
- **배포**: Vercel 정적 배포

Supabase URL / publishable key는 클라이언트 노출이 허용된 값이므로
[js/config.js](js/config.js)에 직접 하드코딩되어 있습니다. (RLS로 데이터 보호)

## 배포 전 준비 (1회)

1. **Supabase 스키마 적용**
   Supabase 대시보드 → SQL Editor → [supabase/schema.sql](supabase/schema.sql) 전체를 붙여넣고 실행.
   (profiles / cells / completions 테이블 + RLS + `specimens` 비공개 스토리지 버킷 생성)

2. **이메일 인증 설정(선택)**
   Supabase → Authentication → Sign In / Up → *Confirm email* 을 끄면
   회원가입 후 메일 인증 없이 바로 접속됩니다. (켜두면 인증 메일 발송)

## 로컬 실행

```bash
npx serve .
```

ES 모듈·서비스워커 특성상 `file://`로는 열 수 없고 로컬 서버가 필요합니다.

## Vercel 배포

```bash
npx vercel --prod
```

또는 GitHub 저장소 연결 후 Import — 프레임워크 프리셋 **Other**, 빌드 명령/출력 디렉터리 없음(정적).

## 게임 규칙 요약

| 스테이지 | 그리드 | 레벨 수 |
|---|---|---|
| 1 | 8×8 | 3 |
| 2 | 16×16 | 2 |
| 3 | 32×32 | 1 |
| 4 | 64×64 | 1 (클리어 후 무한 반복) |

- 하루 5칸 제출(자정 리셋), 셀마다 랜덤 좌표 + 목표 색상 배정
- 판정: 업로드 사진의 대표 색상 HSL **명도 ±15** 이내면 통과 (실패 시 "너무 밝아요/어두워요" 방향 피드백만)
- **소프트 색상 보너스**: 통과와 무관. 사진·목표 둘 다 채도가 충분할 때 색조 근접도(C-SYNC)를 계산해 **68% 이상이면 INK +20** 추가 (못 맞춰도 페널티 없음)
- 정착 시 INK +40 (+색상 보너스) · 스트릭 마일스톤 7/30/100일 (방어권·테마·프리미엄 EXPORT)
- 레벨 100% → 리빌(원색 해제) → 아카이브 보관, 최종 스테이지는 클리어 후 무한 반복
