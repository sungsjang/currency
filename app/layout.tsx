import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAD / USD → KRW 환율 리포트",
  description: "CAD/KRW, USD/KRW 6개월 추세와 실시간 장중 참고환율"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
