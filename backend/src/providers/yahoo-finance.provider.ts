// backend/src/providers/yahoo-finance.provider.ts
import yahooFinance from 'yahoo-finance2';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';

const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NASDAQ: 'US', NYSE: 'US', TSX: 'CA', NSE: 'IN', BSE: 'IN',
  LSE: 'GB', XETRA: 'DE'
};

export class YahooFinanceProvider implements StockDataProvider {
  async getQuote(symbol: string): Promise<RawQuote> {
    const quote: any = await yahooFinance.quote(symbol);
    return {
      symbol: quote.symbol,
      companyName: quote.longName ?? quote.shortName ?? quote.symbol,
      sector: quote.sector ?? 'Unknown',
      exchange: quote.fullExchangeName ?? quote.exchange ?? 'Unknown',
      country: EXCHANGE_COUNTRY_MAP[quote.exchange] ?? 'Unknown',
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

    const cashflowStatements = summary.cashflowStatementHistory?.cashflowStatements ?? [];
    const freeCashFlowHistory = cashflowStatements
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
