import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { RatioService } from './ratio.service';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';
import { TickerHistoryModel } from '../models/ticker-history.model';
import { logger } from '../logger';

const SCOPE = 'TickerService';
const DISPLAY_CURRENCY = 'USD';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export class TickerService {
  constructor(
    private provider: StockDataProvider,
    private calculator: FairValueCalculator,
    private converter: CurrencyConverter
  ) {}

  private async fetchCachedData(symbol: string): Promise<{
    symbol: string; companyName: string; sector: string; exchange: string; country: string; nativeCurrency: string;
    cachedData: CachedData;
  }> {
    logger.info(SCOPE, `fetchCachedData(${symbol}) - calling provider.getQuote`, { symbol });
    const quote = await this.provider.getQuote(symbol);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - got quote`, { symbol, currentPrice: quote.currentPrice, currency: quote.currency, exchange: quote.exchange });

    logger.info(SCOPE, `fetchCachedData(${symbol}) - calling provider.getFinancials`, { symbol });
    const financials = await this.provider.getFinancials(symbol);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - got financials`, { symbol, fcfYears: financials.freeCashFlowHistory.length });

    // A DCF failure (e.g. insufficient or all-negative-prior-year free cash
    // flow history - common for newly-listed, loss-making, or unusual
    // companies) shouldn't fail the whole add/refresh. Fall back to
    // fairValue=0 and record why, so it's visible in the DB for review
    // rather than silently guessed at or blocking the user entirely.
    let fairValue = 0;
    let fairValueError: string | undefined;
    try {
      const fairValueResult = await this.calculator.calculate(financials);
      fairValue = fairValueResult.fairValue;
      logger.info(SCOPE, `fetchCachedData(${symbol}) - calculated fair value`, { symbol, fairValue });
    } catch (err) {
      fairValueError = err instanceof Error ? err.message : String(err);
      logger.warn(SCOPE, `fetchCachedData(${symbol}) - DCF calculation failed, falling back to fairValue=0`, { symbol, error: fairValueError });
    }

    const ratios = RatioService.compute(quote, financials);

    logger.info(SCOPE, `fetchCachedData(${symbol}) - converting ${quote.currency} to ${DISPLAY_CURRENCY}`, { symbol });
    const fxRateToUsd = await this.converter.getRate(quote.currency, DISPLAY_CURRENCY);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - fx rate`, { symbol, fxRateToUsd });

    const cachedData: CachedData = {
      fetchedAt: new Date(),
      currentPrice: quote.currentPrice * fxRateToUsd,
      fairValue: fairValue * fxRateToUsd,
      nativePrice: quote.currentPrice,
      nativeFairValue: fairValue,
      fxRateToUsd,
      priceToBook: ratios.priceToBook,
      priceToBookIndustryAvg: financials.priceToBookIndustryAvg,
      pegRatio: ratios.pegRatio,
      currentRatio: ratios.currentRatio,
      currentRatioIndustryAvg: financials.currentRatioIndustryAvg,
      quickRatio: ratios.quickRatio,
      quickRatioIndustryAvg: financials.quickRatioIndustryAvg,
      lastDividendDate: financials.lastDividendDate,
      lastDividendAmount: financials.lastDividendAmount,
      payoutRatio: ratios.payoutRatio,
      fairValueError
    };

    return {
      symbol: quote.symbol,
      companyName: quote.companyName,
      sector: quote.sector,
      exchange: quote.exchange,
      country: quote.country,
      nativeCurrency: quote.currency,
      cachedData
    };
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
    const { companyName, sector, exchange, country, nativeCurrency, cachedData, symbol: canonicalSymbol } =
      await this.fetchCachedData(normalizedSymbol);

    const created = await TickerModel.create({
      symbol: canonicalSymbol, companyName, sector, exchange, country, nativeCurrency,
      lists: [list], cachedData
    });
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - saved new document to MongoDB`, { symbol: canonicalSymbol, id: String(created._id) });
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

    if (ticker.cachedData) {
      await TickerHistoryModel.create({
        symbol,
        archivedAt: ticker.cachedData.fetchedAt,
        data: ticker.cachedData
      });
      logger.info(SCOPE, `refreshTicker(${symbol}) - archived previous snapshot to history`, { symbol, archivedAt: ticker.cachedData.fetchedAt });
    }

    const { cachedData } = await this.fetchCachedData(symbol);
    ticker.cachedData = cachedData;
    await ticker.save();
    logger.info(SCOPE, `refreshTicker(${symbol}) - saved refreshed data to MongoDB`, { symbol, fetchedAt: cachedData.fetchedAt });
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
