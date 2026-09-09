import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_VERSION = "Ver 0.57";
const CURRENCIES = ["CAD", "USD"] as const;
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const EXCHANGE_RATE_BASE = "https://open.er-api.com/v6/latest";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SYMBOLS = { CAD: "CADKRW=X", USD: "USDKRW=X" } as const;

type Currency = (typeof CURRENCIES)[number];
type DailyPoint = { date: string; value: number };
type IntradayPoint = { time: string; timestamp: number; value: number };

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  const day = copy.getUTCDate();
  copy.setUTCDate(1);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate();
  copy.setUTCDate(Math.min(day, lastDay));
  return copy;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function pctChange(oldValue: number, newValue: number) { return oldValue ? ((newValue - oldValue) / oldValue) * 100 : 0; }
function stats(points: DailyPoint[]) {
  const values = points.map((p) => p.value);
  const first = points[0];
  const last = points[points.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { first, last, min, max, avg, change: last.value - first.value, changePct: pctChange(first.value, last.value) };
}
function decision(points: DailyPoint[], currency: Currency) {
  const all = stats(points);
  const cutoff = new Date(`${all.last.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const recent = points.filter((p) => new Date(`${p.date}T00:00:00Z`) >= cutoff);
  const recentStats = recent.length >= 2 ? stats(recent) : all;
  const previous = points.length >= 2 ? points[points.length - 2] : all.last;
  const rangePosition = all.max > all.min ? (all.last.value - all.min) / (all.max - all.min) : 0.5;
  const dayChange = all.last.value - previous.value;
  const weeklyChange = recentStats.change;
  let action = "관망";
  let tone: "buy" | "sell" | "watch" | "hold" = "hold";
  let reason = "최근 변화가 애매하거나 6개월 범위 중간 구간입니다. 급한 목적이 없으면 다음 고시를 확인하는 편이 낫습니다.";
  if (rangePosition <= 0.25 && weeklyChange <= 0) {
    action = "분할 매수 유리"; tone = "buy"; reason = "6개월 범위의 낮은 구간이고 최근 1주 추세도 내려와 있어 원화 기준 매수 가격이 비교적 낮습니다.";
  } else if (rangePosition >= 0.75 && weeklyChange >= 0) {
    action = "분할 매도 유리"; tone = "sell"; reason = "6개월 범위의 높은 구간이고 최근 1주 추세도 올라와 있어 보유 외화를 원화로 바꾸기 좋은 쪽입니다.";
  } else if (dayChange < 0 && rangePosition < 0.55) {
    action = "소액 분할 매수 검토"; tone = "watch"; reason = "직전 고시일보다 내려왔고 6개월 평균보다 크게 비싸지는 않습니다. 한 번에 사기보다 나눠 사는 쪽이 안전합니다.";
  } else if (dayChange > 0 && rangePosition > 0.45) {
    action = "소액 분할 매도 검토"; tone = "watch"; reason = "직전 고시일보다 올라왔고 6개월 평균 부근 이상입니다. 급한 환전이면 일부 매도는 검토할 만합니다.";
  }
  return { currency, action, tone, reason, latest: all.last, previous, dayChange, dayChangePct: pctChange(previous.value, all.last.value), weekChange: recentStats.change, weekChangePct: recentStats.changePct, sixMonthAverage: all.avg, sixMonthPositionPct: rangePosition * 100 };
}
async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Currency-KRW-Web/0.57 (+https://github.com/sungsjang/currency)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function fetchDaily(currency: Currency, startDate: string) {
  const json = await fetchJson(`${FRANKFURTER_BASE}/${startDate}..?base=${currency}&symbols=KRW`);
  const rates = json.rates ?? {};
  const points: DailyPoint[] = Object.keys(rates).sort().map((date) => ({ date, value: Number(rates[date]?.KRW) })).filter((p) => Number.isFinite(p.value));
  return { currency, source: "Frankfurter API", sourceUrl: "https://frankfurter.dev/", points };
}
async function fetchReference(currency: Currency) {
  const json = await fetchJson(`${EXCHANGE_RATE_BASE}/${currency}`);
  const value = Number(json.rates?.KRW);
  if (!Number.isFinite(value)) throw new Error("KRW rate missing");
  return { currency, source: "ExchangeRate-API Open Access", sourceUrl: "https://www.exchangerate-api.com/docs/free", value, updatedUtc: json.time_last_update_utc ?? "", nextUpdateUtc: json.time_next_update_utc ?? "" };
}
async function fetchYahooIntraday(currency: Currency) {
  const symbol = YAHOO_SYMBOLS[currency];
  const json = await fetchJson(`${YAHOO_CHART_BASE}/${symbol}?range=1d&interval=1m`);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(json.chart?.error?.description ?? "Yahoo result missing");
  const timestamps: number[] = result.timestamp ?? [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];
  const points: IntradayPoint[] = timestamps.map((timestamp, index) => ({ timestamp, value: closes[index] })).filter((p): p is { timestamp: number; value: number } => typeof p.value === "number").map((p) => ({ timestamp: p.timestamp, time: new Date(p.timestamp * 1000).toISOString(), value: p.value }));
  if (!points.length) throw new Error("Yahoo intraday points missing");
  const meta = result.meta ?? {};
  const current = Number(meta.regularMarketPrice ?? points[points.length - 1].value);
  const previousClose = Number(meta.chartPreviousClose ?? points[0].value);
  const open = points[0].value;
  const low = Math.min(...points.map((p) => p.value));
  const high = Math.max(...points.map((p) => p.value));
  return { currency, symbol, source: "Yahoo Finance Chart API", sourceUrl: `https://finance.yahoo.com/quote/${symbol}`, current, previousClose, open, low, high, range: high - low, previousDiff: current - previousClose, previousDiffPct: pctChange(previousClose, current), todayDiff: current - open, todayDiffPct: pctChange(open, current), points, lastUpdated: points[points.length - 1].time };
}

export async function GET() {
  const now = new Date();
  const startDate = isoDate(addMonths(now, -6));
  const generatedAt = now.toISOString();
  const dailyResults = await Promise.allSettled(CURRENCIES.map((c) => fetchDaily(c, startDate)));
  const referenceResults = await Promise.allSettled(CURRENCIES.map((c) => fetchReference(c)));
  const intradayResults = await Promise.allSettled(CURRENCIES.map((c) => fetchYahooIntraday(c)));
  const daily = Object.fromEntries(dailyResults.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchDaily>>> => r.status === "fulfilled").map((r) => [r.value.currency, r.value]));
  const reference = Object.fromEntries(referenceResults.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchReference>>> => r.status === "fulfilled").map((r) => [r.value.currency, r.value]));
  const intraday = Object.fromEntries(intradayResults.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchYahooIntraday>>> => r.status === "fulfilled").map((r) => [r.value.currency, r.value]));
  const dailyStats = Object.fromEntries(CURRENCIES.filter((c) => daily[c]?.points?.length >= 2).map((c) => [c, stats(daily[c].points)]));
  const decisions = Object.fromEntries(CURRENCIES.filter((c) => daily[c]?.points?.length >= 2).map((c) => [c, decision(daily[c].points, c)]));
  const errors = {
    daily: dailyResults.map((r, i) => ({ currency: CURRENCIES[i], ok: r.status === "fulfilled", error: r.status === "rejected" ? String(r.reason?.message ?? r.reason) : null })),
    reference: referenceResults.map((r, i) => ({ currency: CURRENCIES[i], ok: r.status === "fulfilled", error: r.status === "rejected" ? String(r.reason?.message ?? r.reason) : null })),
    intraday: intradayResults.map((r, i) => ({ currency: CURRENCIES[i], ok: r.status === "fulfilled", error: r.status === "rejected" ? String(r.reason?.message ?? r.reason) : null }))
  };
  return NextResponse.json({ appVersion: APP_VERSION, generatedAt, startDate, currencies: CURRENCIES, daily, dailyStats, decisions, reference, intraday, sources: [
    { name: "Frankfurter API", role: "6개월 공식 히스토리", url: "https://frankfurter.dev/" },
    { name: "ExchangeRate-API Open Access", role: "오늘/현재 참고환율", url: "https://www.exchangerate-api.com/docs/free" },
    { name: "Yahoo Finance Chart API", role: "실시간/장중 1분 참고환율", url: "https://finance.yahoo.com/quote/USDKRW=X" },
    { name: "한국은행 ECOS / 한국수출입은행", role: "한국 공식 소스 후보", url: "API 키 필요" }
  ], errors }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=300" } });
}
