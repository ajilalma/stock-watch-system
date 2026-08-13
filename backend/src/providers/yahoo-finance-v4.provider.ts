// backend/src/providers/yahoo-finance-v4.provider.ts
//
// StockDataProvider implementation on yahoo-finance2 v4, installed alongside
// v2 under a package alias (`yahoo-finance2-v4` -> npm:yahoo-finance2@^4.0.2)
// so both versions coexist and either can be wired up in server.ts without
// touching TickerService or the StockDataProvider interface. v2 is kept as
// YahooFinanceProvider (yahoo-finance.provider.ts) for fallback.
//
// v4 field names below (price/summaryProfile/defaultKeyStatistics/
// financialData/summaryDetail modules) are verified against the installed
// package's TypeScript definitions (node_modules/yahoo-finance2-v4/esm/src/
// modules/quoteSummary-iface.d.ts), which is authoritative for field
// *existence* - but NOT yet verified against a live response, since Yahoo
// was rate-limiting at the time this was written. The "not found" error
// message pattern is also carried over from v2 unverified. Spot-check once
// unblocked, same discipline as yahoo-finance.provider.ts.
//
// Unlike v2, cash flow data is NOT available (beyond minimal data) via
// quoteSummary in v4 - Yahoo moved it to a separate fundamentalsTimeSeries
// endpoint. This means getFinancials() here makes its own additional call
// beyond the shared quoteSummary fetch: 2 real Yahoo requests per full
// add/refresh (quoteSummary + fundamentalsTimeSeries), vs. the 1 call
// yahoo-finance.provider.ts (v2) now makes. Not a throttling improvement by
// itself - this exists for library maintenance/reliability, not to reduce
// request volume.
import YahooFinance from 'yahoo-finance2-v4';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

// See yahoo-finance.provider.ts for how these values were originally
// derived (empirically, against v2's `fullExchangeName`). v4's `price`
// module has no `fullExchangeName` field at all (confirmed from its .d.ts) -
// only `exchange` and `exchangeName` - so the fallback chain below drops it.
const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NasdaqGS: 'US', NASDAQ: 'US', NYSE: 'US', Toronto: 'CA', TSX: 'CA',
  NSE: 'IN', BSE: 'IN', LSE: 'GB', XETRA: 'DE'
};

const NOT_FOUND_MESSAGE_PATTERN = /not found/i;

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && NOT_FOUND_MESSAGE_PATTERN.test(err.message);
}

const QUOTE_SUMMARY_MODULES = [
  'price',
  'summaryProfile',
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail'
] as const;

const SUMMARY_REUSE_WINDOW_MS = 10_000;

// How far back to request annual free-cash-flow history. RawFinancials
// documents "up to 5 years" of freeCashFlowHistory.
const CASH_FLOW_HISTORY_YEARS = 5;

export class YahooFinanceV4Provider implements StockDataProvider {
  private client = new YahooFinance();
  private pendingSummaries = new Map<string, Promise<any>>();

  private fetchQuoteSummary(symbol: string): Promise<any> {
    const cached = this.pendingSummaries.get(symbol);
    if (cached) return cached;

    const promise = this.client.quoteSummary(symbol, { modules: QUOTE_SUMMARY_MODULES } as any);
    this.pendingSummaries.set(symbol, promise);
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
      if (isNotFoundError(err)) throw new SymbolNotFoundError(symbol);
      throw err;
    }
  }

  async getQuote(symbol: string): Promise<RawQuote> {
    const summary = await this.getSummary(symbol);
    const price = summary.price;
    if (!price) throw new SymbolNotFoundError(symbol);

    const exchange = price.exchangeName ?? price.exchange ?? 'Unknown';
    return {
      symbol: price.symbol ?? symbol,
      companyName: price.longName ?? price.shortName ?? price.symbol ?? symbol,
      sector: summary.summaryProfile?.sector ?? 'Unknown',
      exchange,
      country: EXCHANGE_COUNTRY_MAP[exchange] ?? 'Unknown',
      currency: price.currency,
      currentPrice: price.regularMarketPrice
    };
  }

  async getFinancials(symbol: string): Promise<RawFinancials> {
    const summary = await this.getSummary(symbol);
    const freeCashFlowHistory = await this.fetchFreeCashFlowHistory(symbol);

    return {
      symbol,
      freeCashFlowHistory,
      sharesOutstanding: summary.defaultKeyStatistics?.sharesOutstanding,
      bookValuePerShare: summary.defaultKeyStatistics?.bookValue,
      earningsPerShare: summary.defaultKeyStatistics?.trailingEps,
      earningsGrowthRate: summary.financialData?.earningsGrowth
        ? summary.financialData.earningsGrowth * 100
        : undefined,
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

  // fundamentalsTimeSeries returns one entry per period with a `date` and
  // `freeCashFlow` (module: 'cash-flow', type: 'annual') - order across
  // periods is not documented, so this sorts by date ascending itself
  // rather than assuming an order, unlike the v2 provider's cashflowStatementHistory
  // mapping (which relies on an empirically-confirmed newest-first order).
  private async fetchFreeCashFlowHistory(symbol: string): Promise<number[]> {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - CASH_FLOW_HISTORY_YEARS);

    const results: any[] = await (this.client as any).fundamentalsTimeSeries(symbol, {
      period1,
      type: 'annual',
      module: 'cash-flow'
    });

    return [...(results ?? [])]
      .filter(r => typeof r.freeCashFlow === 'number')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(r => r.freeCashFlow);
  }
}
