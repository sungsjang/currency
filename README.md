# CAD / USD → KRW 환율 웹 대시보드

Ver 0.57

PC용 `CAD_KRW.exe` 앱의 핵심 기능을 Vercel 배포용 Next.js 웹앱으로 포팅한 버전입니다.

## 기능

- CAD/KRW, USD/KRW 6개월 공식 히스토리
- CAD/USD 통화별 분리 그래프
- 최근 1주일 확대 그래프
- Yahoo Finance 1분 데이터 기반 실시간/장중 참고환율
- 어제/직전 종가 대비 현재 차이
- 오늘 시작가 대비 현재 차이
- 오늘 저가/고가/장중 변동폭
- 매수/매도 참고 판단
- 데이터 출처 표시
- 60초마다 자동 새로고침

## 데이터 소스

- Frankfurter API: 6개월 공식 히스토리
- ExchangeRate-API Open Access: 오늘/현재 참고환율
- Yahoo Finance Chart API: 실시간/장중 1분 참고환율
- 한국은행 ECOS / 한국수출입은행: 향후 API 키 입력 시 연결 가능

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Vercel 배포

GitHub 저장소를 Vercel에서 Import 하면 됩니다.

또는 Vercel CLI를 쓴다면:

```bash
npm install -g vercel
vercel
vercel --prod
```

## 주의

투자 판단은 참고용입니다. 실제 환전·투자는 수수료, 목적 자금, 목표 환율, 현금흐름을 함께 고려하세요.
