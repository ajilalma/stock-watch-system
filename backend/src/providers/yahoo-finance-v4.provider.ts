// backend/src/providers/yahoo-finance-v4.provider.ts
//
// The only StockDataProvider implementation, built on yahoo-finance2 v4
// (installed under the package alias `yahoo-finance2-v4`).
//
// Field names below (price/summaryProfile/defaultKeyStatistics/financialData/
// summaryDetail modules) are verified against the installed package's
// TypeScript definitions, which is authoritative for field *existence* - but
// not yet against a live response, since Yahoo was rate-limiting when this
// was written. The "not found" error message pattern is likewise unverified.
// See TODO.md; spot-check once unblocked.
//
// Cash flow data is not available via quoteSummary in v4 - Yahoo moved it to
// fundamentalsTimeSeries - so a full fetch is two Yahoo requests.
import YahooFinance from 'yahoo-finance2-v4';
import { StockDataProvider, StockData } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';
import { logger } from '../logger';

const SCOPE = 'YahooFinanceProvider(v4)';

// Derived empirically against the exchange names Yahoo returns. An exchange
// missing from this map yields an undefined country and a recorded error,
// which is how gaps here become visible.
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

// RawFinancials documents "up to 5 years" of freeCashFlowHistory.
const CASH_FLOW_HISTORY_YEARS = 5;

export class YahooFinanceV4Provider implements StockDataProvider {
  private client = new YahooFinance();

  async getStockData(symbol: string): Promise<StockData> {
    logger.info(SCOPE, `getStockData(${symbol}) - calling Yahoo quoteSummary`, { symbol, modules: QUOTE_SUMMARY_MODULES });
    const quoteSummary = await this.fetchQuoteSummary(symbol);

    logger.info(SCOPE, `getStockData(${symbol}) - calling fundamentalsTimeSeries for cash flow`, { symbol });
    const fundamentalsTimeSeries = await this.fetchFundamentalsTimeSeries(symbol);

    const quote = this.toQuote(symbol, quoteSummary);
    const financials = this.toFinancials(symbol, quoteSummary, fundamentalsTimeSeries);

    logger.info(SCOPE, `getStockData(${symbol}) - resolved`, {
      symbol, currentPrice: quote.currentPrice, currency: quote.currency,
      exchange: quote.exchange, freeCashFlowYears: financials.freeCashFlowHistory.length
    });

    return { quote, financials, raw: { quoteSummary, fundamentalsTimeSeries } };
  }

  private async fetchQuoteSummary(symbol: string): Promise<any> {
    try {
      return await this.client.quoteSummary(symbol, { modules: QUOTE_SUMMARY_MODULES } as any);
    } catch (err) {
      if (isNotFoundError(err)) {
        logger.warn(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo reports symbol not found`, { symbol });
        throw new SymbolNotFoundError(symbol);
      }
      logger.error(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo call failed`, { symbol, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // fundamentalsTimeSeries returns one entry per period with a `date` and
  // `freeCashFlow`. Order across periods is not documented, so the mapping
  // sorts by date rather than assuming one.
  private async fetchFundamentalsTimeSeries(symbol: string): Promise<any[]> {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - CASH_FLOW_HISTORY_YEARS);

    return await (this.client as any).fundamentalsTimeSeries(symbol, {
      period1,
      type: 'annual',
      module: 'cash-flow'
    });
  }

  private toQuote(symbol: string, summary: any): RawQuote {
    const price = summary?.price;
    if (!price) {
      logger.warn(SCOPE, `toQuote(${symbol}) - no price module in response`, { symbol });
      throw new SymbolNotFoundError(symbol);
    }

    const exchange = price.exchangeName ?? price.exchange;
    return {
      symbol: price.symbol ?? symbol,
      companyName: price.longName ?? price.shortName,
      sector: summary.summaryProfile?.sector,
      exchange,
      country: exchange ? EXCHANGE_COUNTRY_MAP[exchange] : undefined,
      currency: price.currency,
      currentPrice: price.regularMarketPrice
    };
  }

  private toFinancials(symbol: string, summary: any, timeSeries: any[]): RawFinancials {
    const stats = summary.defaultKeyStatistics;
    const financialData = summary.financialData;
    const summaryDetail = summary.summaryDetail;

    return {
      symbol,
      freeCashFlowHistory: [...(timeSeries ?? [])]
        .filter(r => typeof r.freeCashFlow === 'number')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(r => r.freeCashFlow),
      sharesOutstanding: stats?.sharesOutstanding,
      bookValuePerShare: stats?.bookValue,
      earningsPerShare: stats?.trailingEps,
      earningsGrowthRate: financialData?.earningsGrowth
        ? financialData.earningsGrowth * 100
        : undefined,
      currentRatio: financialData?.currentRatio,
      quickRatio: financialData?.quickRatio,
      lastDividendDate: summaryDetail?.exDividendDate
        ? new Date(summaryDetail.exDividendDate)
        : undefined,
      lastDividendAmount: summaryDetail?.dividendRate,
      dividendsPaidTTM: summaryDetail?.dividendRate && stats?.sharesOutstanding
        ? summaryDetail.dividendRate * stats.sharesOutstanding
        : undefined,
      netIncomeTTM: financialData?.netIncomeToCommon,
      priceToBookIndustryAvg: undefined,
      currentRatioIndustryAvg: undefined,
      quickRatioIndustryAvg: undefined
    };
  }
}
