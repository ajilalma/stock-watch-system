import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import {
  computeCompanyName, computeSector, computeExchange, computeCountry,
  computeFairValue, computePriceToBook, computePegRatio,
  computeCurrentRatio, computeQuickRatio, computePayoutRatio,
  computeFxRate, collectErrors
} from './datapoint-calculators';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';
import { TickerHistoryModel } from '../models/ticker-history.model';
import { logger } from '../logger';

const SCOPE = 'TickerService';
const DISPLAY_CURRENCY = 'USD';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

interface FetchedStock {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  cachedData: CachedData;
  datapointErrors: Record<string, string>;
  raw: unknown;
}

export class TickerService {
  constructor(
    private provider: StockDataProvider,
    private calculator: FairValueCalculator,
    private converter: CurrencyConverter
  ) {}

  // Pure orchestration: fetch once, then run each datapoint calculation
  // independently. None of the calculators throw, so a company missing one or
  // two derivable figures still produces a complete document with the reasons
  // recorded alongside it.
  private async fetchStockData(symbol: string): Promise<FetchedStock> {
    logger.info(SCOPE, `fetchStockData(${symbol}) - calling provider`, { symbol });
    const { quote, financials, raw } = await this.provider.getStockData(symbol);
    logger.info(SCOPE, `fetchStockData(${symbol}) - got stock data`, {
      symbol, currentPrice: quote.currentPrice, currency: quote.currency,
      fcfYears: financials.freeCashFlowHistory.length
    });

    const companyName = computeCompanyName(quote);
    const sector = computeSector(quote);
    const exchange = computeExchange(quote);
    const country = computeCountry(quote);
    const fairValue = await computeFairValue(financials, this.calculator);
    const priceToBook = computePriceToBook(quote, financials);
    const pegRatio = computePegRatio(quote, financials);
    const currentRatio = computeCurrentRatio(financials);
    const quickRatio = computeQuickRatio(financials);
    const payoutRatio = computePayoutRatio(financials);
    const fxRateToUsd = await computeFxRate(quote, DISPLAY_CURRENCY, this.converter);

    const errors = collectErrors({
      companyName, sector, exchange, country, fairValue, priceToBook,
      pegRatio, currentRatio, quickRatio, payoutRatio, fxRateToUsd
    });

    // Native values are stored pre-conversion, so a failed FX lookup leaves
    // them correct regardless of what the rate fell back to.
    const cachedData: CachedData = {
      fetchedAt: new Date(),
      currentPrice: quote.currentPrice * fxRateToUsd.value,
      fairValue: fairValue.value * fxRateToUsd.value,
      nativePrice: quote.currentPrice,
      nativeFairValue: fairValue.value,
      fxRateToUsd: fxRateToUsd.value,
      priceToBook: priceToBook.value,
      priceToBookIndustryAvg: financials.priceToBookIndustryAvg,
      pegRatio: pegRatio.value,
      currentRatio: currentRatio.value,
      currentRatioIndustryAvg: financials.currentRatioIndustryAvg,
      quickRatio: quickRatio.value,
      quickRatioIndustryAvg: financials.quickRatioIndustryAvg,
      lastDividendDate: financials.lastDividendDate,
      lastDividendAmount: financials.lastDividendAmount,
      payoutRatio: payoutRatio.value
    };

    logger.info(SCOPE, `fetchStockData(${symbol}) - assembled`, { symbol, errorFields: Object.keys(errors) });

    return {
      symbol: quote.symbol,
      companyName: companyName.value,
      sector: sector.value,
      exchange: exchange.value,
      country: country.value,
      nativeCurrency: quote.currency,
      cachedData,
      datapointErrors: errors,
      raw
    };
  }

  // Every write to the tickers collection appends a snapshot here, so the
  // tickers collection stays light for the UI while history carries both the
  // time series and the raw payload for debugging. A failure to archive is
  // logged but never fails the add/refresh - the ticker document is what the
  // UI needs; history is supporting data.
  private async archiveSnapshot(symbol: string, fetched: FetchedStock): Promise<void> {
    try {
      await TickerHistoryModel.create({
        symbol,
        archivedAt: fetched.cachedData.fetchedAt,
        data: fetched.cachedData,
        datapointErrors: fetched.datapointErrors,
        stockRawData: fetched.raw
      });
      logger.info(SCOPE, `archiveSnapshot(${symbol}) - snapshot written`, { symbol, archivedAt: fetched.cachedData.fetchedAt });
    } catch (err) {
      logger.error(SCOPE, `archiveSnapshot(${symbol}) - failed to write snapshot, continuing`, {
        symbol, error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  async addTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<TickerDocument> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - checking for existing document`, { symbol: normalizedSymbol, list });
    const existing = await TickerModel.findOne({ symbol: normalizedSymbol });
    if (existing) {
      if (!existing.lists.includes(list)) {
        existing.lists.push(list);
        await existing.save();
        logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - added list to existing document`, { symbol: normalizedSymbol, lists: existing.lists });
      } else {
        logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - already in that list, no-op`, { symbol: normalizedSymbol });
      }
      return existing;
    }

    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - no existing document, fetching fresh data`, { symbol: normalizedSymbol });
    const fetched = await this.fetchStockData(normalizedSymbol);

    const created = await TickerModel.create({
      symbol: fetched.symbol, companyName: fetched.companyName, sector: fetched.sector,
      exchange: fetched.exchange, country: fetched.country, nativeCurrency: fetched.nativeCurrency,
      lists: [list], cachedData: fetched.cachedData, datapointErrors: fetched.datapointErrors
    });
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - saved new document to MongoDB`, { symbol: fetched.symbol, id: String(created._id) });

    await this.archiveSnapshot(fetched.symbol, fetched);
    return created;
  }

  async removeTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<void> {
    logger.info(SCOPE, `removeTicker(${symbol}, ${list})`, { symbol, list });
    const ticker = await TickerModel.findOne({ symbol });
    if (!ticker) {
      logger.warn(SCOPE, `removeTicker(${symbol}, ${list}) - no document found, nothing to remove`, { symbol });
      return;
    }

    ticker.lists = ticker.lists.filter(l => l !== list);
    if (ticker.lists.length === 0) {
      await TickerModel.deleteOne({ symbol });
      logger.info(SCOPE, `removeTicker(${symbol}, ${list}) - last list removed, deleted document`, { symbol });
    } else {
      await ticker.save();
      logger.info(SCOPE, `removeTicker(${symbol}, ${list}) - removed from list, document kept`, { symbol, remainingLists: ticker.lists });
    }
  }

  async getList(list: 'portfolio' | 'watchlist'): Promise<TickerDocument[]> {
    logger.info(SCOPE, `getList(${list}) - querying MongoDB`, { list });
    const tickers = await TickerModel.find({ lists: list }).sort({ sector: 1, companyName: 1 });
    logger.info(SCOPE, `getList(${list}) - found documents`, { list, count: tickers.length, symbols: tickers.map(t => t.symbol) });
    return Promise.all(tickers.map(t => this.ensureFresh(t)));
  }

  async refreshTicker(symbol: string): Promise<TickerDocument> {
    logger.info(SCOPE, `refreshTicker(${symbol})`, { symbol });
    const ticker = await TickerModel.findOne({ symbol });
    if (!ticker) {
      logger.error(SCOPE, `refreshTicker(${symbol}) - no document found`, { symbol });
      throw new Error(`Ticker ${symbol} not found`);
    }

    const fetched = await this.fetchStockData(symbol);
    ticker.cachedData = fetched.cachedData;
    // Assigned wholesale rather than merged, so a datapoint that recovered
    // since the last fetch drops its stale error.
    ticker.datapointErrors = new Map(Object.entries(fetched.datapointErrors));
    await ticker.save();
    logger.info(SCOPE, `refreshTicker(${symbol}) - saved refreshed data to MongoDB`, { symbol, fetchedAt: fetched.cachedData.fetchedAt, errorFields: Object.keys(fetched.datapointErrors) });

    await this.archiveSnapshot(symbol, fetched);
    return ticker;
  }

  async refreshTickers(symbols: string[]): Promise<TickerDocument[]> {
    logger.info(SCOPE, 'refreshTickers - starting batch', { symbols });
    const results: TickerDocument[] = [];
    for (const symbol of symbols) {
      results.push(await this.refreshTicker(symbol));
    }
    logger.info(SCOPE, 'refreshTickers - batch complete', { count: results.length });
    return results;
  }

  async refreshAll(): Promise<TickerDocument[]> {
    const all = await TickerModel.find({});
    logger.info(SCOPE, 'refreshAll - refreshing every tracked ticker', { count: all.length, symbols: all.map(t => t.symbol) });
    return this.refreshTickers(all.map(t => t.symbol));
  }

  async ensureFresh(ticker: TickerDocument): Promise<TickerDocument> {
    const fetchedAt = ticker.cachedData?.fetchedAt;
    const isStale = !fetchedAt || (Date.now() - fetchedAt.getTime()) > FIFTEEN_DAYS_MS;
    if (!isStale) {
      logger.info(SCOPE, `ensureFresh(${ticker.symbol}) - cache is fresh, skipping refresh`, { symbol: ticker.symbol, fetchedAt });
      return ticker;
    }
    logger.info(SCOPE, `ensureFresh(${ticker.symbol}) - cache is stale or missing, refreshing`, { symbol: ticker.symbol, fetchedAt });
    return this.refreshTicker(ticker.symbol);
  }
}
