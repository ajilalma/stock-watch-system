// backend/src/providers/yahoo-finance.provider.ts
import yahooFinance from 'yahoo-finance2';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';

// Keyed on `fullExchangeName` (NOT `exchange`, which is Yahoo's short internal
// code, e.g. NMS/NYQ/TOR/NSI/GER — verified empirically against the live API,
// see task-6-report.md "Fix round 1"). fullExchangeName values observed:
// AAPL -> "NasdaqGS", IBM -> "NYSE", SHOP.TO -> "Toronto",
// RELIANCE.NS -> "NSE", SAP.DE -> "XETRA", HSBA.L -> "LSE".
const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NasdaqGS: 'US', NASDAQ: 'US', NYSE: 'US', Toronto: 'CA', TSX: 'CA',
  NSE: 'IN', BSE: 'IN', LSE: 'GB', XETRA: 'DE'
};

export class YahooFinanceProvider implements StockDataProvider {
  async getQuote(symbol: string): Promise<RawQuote> {
    const quote: any = await yahooFinance.quote(symbol);
    const exchange = quote.fullExchangeName ?? quote.exchange ?? 'Unknown';
    return {
      symbol: quote.symbol,
      companyName: quote.longName ?? quote.shortName ?? quote.symbol,
      sector: quote.sector ?? 'Unknown',
      exchange,
      country: EXCHANGE_COUNTRY_MAP[exchange] ?? 'Unknown',
      currency: quote.currency,
      currentPrice: quote.regularMarketPrice
    };
  }

  async getFinancials(symbol: string): Promise<RawFinancials> {
    const summary: any = await (yahooFinance.quoteSummary as any)(symbol, {
      modules: [
        'defaultKeyStatistics',
        'financialData',
        'summaryDetail',
        'cashflowStatementHistory'
      ]
    });

    // Yahoo returns cashflowStatements newest-first (verified empirically against
    // the live API on a real AAPL response: endDate 2025-09-30, 2024-09-30,
    // 2023-09-30, 2022-09-30 in that array order — see task-6-report.md
    // "Fix round 1"). Reversed here to match RawFinancials' documented
    // oldest-first, most-recent-last contract, which DcfFairValueCalculator relies on.
    const cashflowStatements = summary.cashflowStatementHistory?.cashflowStatements ?? [];
    const freeCashFlowHistory = [...cashflowStatements]
      .reverse()
      .map((s: any) => s.freeCashFlow)
      .filter((v: number | undefined) => typeof v === 'number');

    return {
      symbol,
      freeCashFlowHistory,
      sharesOutstanding: summary.defaultKeyStatistics?.sharesOutstanding,
      bookValuePerShare: summary.defaultKeyStatistics?.bookValue,
      earningsPerShare: summary.defaultKeyStatistics?.trailingEps,
      earningsGrowthRate: summary.financialData?.earningsGrowth
        ? summary.financialData.earningsGrowth * 100
        : undefined,
      currentAssets: summary.financialData?.currentRatio && summary.financialData?.totalCurrentLiabilities
        ? summary.financialData.currentRatio * summary.financialData.totalCurrentLiabilities
        : summary.financialData?.currentRatio, // fallback if raw asset/liability figures unavailable
      currentLiabilities: summary.financialData?.totalCurrentLiabilities ?? 1,
      inventory: summary.financialData?.inventory ?? 0,
      lastDividendDate: summary.summaryDetail?.exDividendDate
        ? new Date(summary.summaryDetail.exDividendDate)
        : undefined,
      lastDividendAmount: summary.summaryDetail?.dividendRate,
      dividendsPaidTTM: summary.summaryDetail?.dividendRate && summary.defaultKeyStatistics?.sharesOutstanding
        ? summary.summaryDetail.dividendRate * summary.defaultKeyStatistics.sharesOutstanding
        : undefined,
      netIncomeTTM: summary.financialData?.netIncomeToCommon,
      priceToBookIndustryAvg: undefined,
      currentRatioIndustryAvg: undefined,
      quickRatioIndustryAvg: undefined
    };
  }
}
