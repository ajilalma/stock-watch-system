// backend/src/providers/yahoo-finance.provider.ts
import yahooFinance from 'yahoo-finance2';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';
import { logger } from '../logger';

const SCOPE = 'YahooFinanceProvider(v2)';

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

const ALL_MODULES = [
  'price',
  'summaryProfile',
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail',
  'cashflowStatementHistory'
] as const;

// How long a fetched quoteSummary is reused across getQuote()/getFinancials()
// calls for the same symbol. TickerService.fetchCachedData always calls both
// back-to-back for one symbol, so this collapses what used to be 3 separate
// Yahoo requests (quote + summaryProfile + financials) into 1. Short window,
// not a real cache - just wide enough to cover those two sequential calls.
const SUMMARY_REUSE_WINDOW_MS = 10_000;

export class YahooFinanceProvider implements StockDataProvider {
  private pendingSummaries = new Map<string, Promise<any>>();

  // NOTE: the `price` module's exact field names (exchangeName vs
  // fullExchangeName vs exchange) have NOT been empirically verified against
  // the live API yet - Yahoo was rate-limiting at the time this was written.
  // The fallback chains below cover the field names documented/observed for
  // this module, but should be spot-checked against a real response (e.g.
  // console.log(JSON.stringify(summary.price)) for AAPL) once requests are
  // going through again, the same way the cashflowStatements ordering and
  // the original quote()/EXCHANGE_COUNTRY_MAP mapping were verified.
  private fetchQuoteSummary(symbol: string): Promise<any> {
    const cached = this.pendingSummaries.get(symbol);
    if (cached) {
      logger.info(SCOPE, `fetchQuoteSummary(${symbol}) - reusing in-flight/recent call`, { symbol });
      return cached;
    }

    logger.info(SCOPE, `fetchQuoteSummary(${symbol}) - calling Yahoo quoteSummary`, { symbol, modules: ALL_MODULES });
    const promise = (yahooFinance.quoteSummary as any)(symbol, { modules: ALL_MODULES });
    this.pendingSummaries.set(symbol, promise);
    promise.then(
      () => logger.info(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo call succeeded`, { symbol }),
      (err: unknown) => logger.error(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo call failed`, { symbol, error: err instanceof Error ? err.message : String(err) })
    );
    setTimeout(() => {
      if (this.pendingSummaries.get(symbol) === promise) {
        this.pendingSummaries.delete(symbol);
      }
    }, SUMMARY_REUSE_WINDOW_MS).unref?.();

    return promise;
  }

  private async getSummary(symbol: string): Promise<any> {
    try {
      return await this.fetchQuoteSummary(symbol);
    } catch (err) {
      if (isNotFoundError(err)) {
        logger.warn(SCOPE, `getSummary(${symbol}) - Yahoo reports symbol not found`, { symbol });
        throw new SymbolNotFoundError(symbol);
      }
      throw err;
    }
  }

  async getQuote(symbol: string): Promise<RawQuote> {
    const summary = await this.getSummary(symbol);
    const price = summary.price;
    // An unknown symbol can come back as a 200 with an empty/missing `price`
    // module rather than a thrown error (this was quote()'s behavior before
    // the single-call merge; carrying the same guard forward defensively).
    if (!price) {
      logger.warn(SCOPE, `getQuote(${symbol}) - no price module in response`, { symbol });
      throw new SymbolNotFoundError(symbol);
    }

    const exchange = price.exchangeName ?? price.fullExchangeName ?? price.exchange ?? 'Unknown';
    const result: RawQuote = {
      symbol: price.symbol ?? symbol,
      companyName: price.longName ?? price.shortName ?? price.symbol ?? symbol,
      sector: summary.summaryProfile?.sector ?? 'Unknown',
      exchange,
      country: EXCHANGE_COUNTRY_MAP[exchange] ?? 'Unknown',
      currency: price.currency,
      currentPrice: price.regularMarketPrice
    };
    logger.info(SCOPE, `getQuote(${symbol}) - resolved`, result as unknown as Record<string, unknown>);
    return result;
  }

  async getFinancials(symbol: string): Promise<RawFinancials> {
    const summary = await this.getSummary(symbol);

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

    logger.info(SCOPE, `getFinancials(${symbol}) - resolved`, { symbol, freeCashFlowYears: freeCashFlowHistory.length, sharesOutstanding: summary.defaultKeyStatistics?.sharesOutstanding });

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
