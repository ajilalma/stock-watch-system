// backend/src/providers/yahoo-finance.provider.ts
import yahooFinance from 'yahoo-finance2';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

// Keyed on `fullExchangeName` (NOT `exchange`, which is Yahoo's short internal
// code, e.g. NMS/NYQ/TOR/NSI/GER — verified empirically against the live API,
// see task-6-report.md "Fix round 1"). fullExchangeName values observed:
// AAPL -> "NasdaqGS", IBM -> "NYSE", SHOP.TO -> "Toronto",
// RELIANCE.NS -> "NSE", SAP.DE -> "XETRA", HSBA.L -> "LSE".
const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NasdaqGS: 'US', NASDAQ: 'US', NYSE: 'US', Toronto: 'CA', TSX: 'CA',
  NSE: 'IN', BSE: 'IN', LSE: 'GB', XETRA: 'DE'
};

// Yahoo's error payload for an unknown symbol on quoteSummary reads
// `{"quoteSummary":{"result":null,"error":{"code":"Not Found","description":
// "Quote not found for symbol: X"}}}` (verified empirically against the live
// API for a garbage symbol) — yahoo-finance2 turns that into a generic Error
// whose message contains "not found". Matched case-insensitively below.
const NOT_FOUND_MESSAGE_PATTERN = /not found/i;

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && NOT_FOUND_MESSAGE_PATTERN.test(err.message);
}

export class YahooFinanceProvider implements StockDataProvider {
  async getQuote(symbol: string): Promise<RawQuote> {
    const quote: any = await yahooFinance.quote(symbol).catch((err: unknown) => {
      if (isNotFoundError(err)) throw new SymbolNotFoundError(symbol);
      throw err;
    });
    // For an unknown symbol, yahoo-finance2's quote() resolves to `undefined`
    // rather than throwing (verified empirically: the underlying v7/finance/quote
    // endpoint returns HTTP 200 with an empty result array for a bad symbol,
    // so the library has nothing to throw on).
    if (!quote) throw new SymbolNotFoundError(symbol);

    const profile = await this.fetchSummaryProfile(symbol);

    const exchange = quote.fullExchangeName ?? quote.exchange ?? 'Unknown';
    return {
      symbol: quote.symbol,
      companyName: quote.longName ?? quote.shortName ?? quote.symbol,
      sector: profile?.sector ?? 'Unknown',
      exchange,
      country: EXCHANGE_COUNTRY_MAP[exchange] ?? 'Unknown',
      currency: quote.currency,
      currentPrice: quote.regularMarketPrice
    };
  }

  // Sector lives in the `summaryProfile` quoteSummary module, not on the
  // `quote()` response (verified against the live API and the installed
  // yahoo-finance2 typings: quote.d.ts has zero occurrences of "sector").
  private async fetchSummaryProfile(symbol: string): Promise<{ sector?: string } | undefined> {
    try {
      const summary: any = await (yahooFinance.quoteSummary as any)(symbol, {
        modules: ['summaryProfile']
      });
      return summary.summaryProfile;
    } catch (err) {
      if (isNotFoundError(err)) throw new SymbolNotFoundError(symbol);
      throw err;
    }
  }

  async getFinancials(symbol: string): Promise<RawFinancials> {
    const summary: any = await (yahooFinance.quoteSummary as any)(symbol, {
      modules: [
        'defaultKeyStatistics',
        'financialData',
        'summaryDetail',
        'cashflowStatementHistory'
      ]
    }).catch((err: unknown) => {
      if (isNotFoundError(err)) throw new SymbolNotFoundError(symbol);
      throw err;
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
      // Yahoo's `financialData` module returns finished ratios directly; it does
      // NOT expose totalCurrentAssets/totalCurrentLiabilities/inventory (those
      // would need `balanceSheetHistory`, which - verified empirically against
      // the live API for a real symbol - no longer returns real balance-sheet
      // figures via the public endpoint, only {maxAge, endDate} per statement).
      // Passing the Yahoo-computed ratios through avoids reconstructing them
      // from unavailable/fabricated inputs (see RatioService).
      currentRatio: summary.financialData?.currentRatio,
      quickRatio: summary.financialData?.quickRatio,
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
