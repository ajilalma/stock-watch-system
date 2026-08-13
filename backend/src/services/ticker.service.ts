import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { RatioService } from './ratio.service';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';

const DISPLAY_CURRENCY = 'USD';

export class TickerService {
  constructor(
    private provider: StockDataProvider,
    private calculator: FairValueCalculator,
    private converter: CurrencyConverter
  ) {}

  private async fetchCachedData(symbol: string): Promise<{
    companyName: string; sector: string; exchange: string; country: string; nativeCurrency: string;
    cachedData: CachedData;
  }> {
    const quote = await this.provider.getQuote(symbol);
    const financials = await this.provider.getFinancials(symbol);
    const fairValueResult = await this.calculator.calculate(financials);
    const ratios = RatioService.compute(quote, financials);
    const fxRateToUsd = await this.converter.getRate(quote.currency, DISPLAY_CURRENCY);

    const cachedData: CachedData = {
      fetchedAt: new Date(),
      currentPrice: quote.currentPrice * fxRateToUsd,
      fairValue: fairValueResult.fairValue * fxRateToUsd,
      nativePrice: quote.currentPrice,
      nativeFairValue: fairValueResult.fairValue,
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
      payoutRatio: ratios.payoutRatio
    };

    return {
      companyName: quote.companyName,
      sector: quote.sector,
      exchange: quote.exchange,
      country: quote.country,
      nativeCurrency: quote.currency,
      cachedData
    };
  }

  async addTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<TickerDocument> {
    const existing = await TickerModel.findOne({ symbol });
    if (existing) {
      if (!existing.lists.includes(list)) {
        existing.lists.push(list);
        await existing.save();
      }
      return existing;
    }

    const { companyName, sector, exchange, country, nativeCurrency, cachedData } =
      await this.fetchCachedData(symbol);

    return TickerModel.create({
      symbol, companyName, sector, exchange, country, nativeCurrency,
      lists: [list], cachedData
    });
  }

  async removeTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<void> {
    const ticker = await TickerModel.findOne({ symbol });
    if (!ticker) return;

    ticker.lists = ticker.lists.filter(l => l !== list);
    if (ticker.lists.length === 0) {
      await TickerModel.deleteOne({ symbol });
    } else {
      await ticker.save();
    }
  }

  async getList(list: 'portfolio' | 'watchlist'): Promise<TickerDocument[]> {
    return TickerModel.find({ lists: list }).sort({ sector: 1, companyName: 1 });
  }
}
