# Luck to you (럭뜌) – GitHub Pages 번호 생성기 (회차 seed 연동)

## 특징
- **3번 모드**: 같은 최신 회차(seed)에서는 생성 버튼을 여러 번 눌러도 결과가 **항상 동일**합니다.
- 새 회차가 업데이트되어 `data/lotto_draws.json`의 최신 회차가 바뀌면, 추천 결과도 자동으로 바뀝니다.
- 데이터는 GitHub Actions가 서버사이드에서 동행복권 JSON을 수집해 저장소에 커밋합니다.

## 배포
1) 이 저장소를 GitHub에 업로드
2) Settings → Pages → Deploy from branch → (main / root)
3) 최초 1회: Actions 탭에서 `Update lotto draws` workflow를 `Run workflow` 실행

## 파일 구조
- index.html
- data/lotto_draws.json
- scripts/update_draws.mjs
- .github/workflows/update-draws.yml
