// backend/src/errors/symbol-not-found.error.ts
// Thrown by StockDataProvider implementations when the upstream data source
// has no data for a given symbol (e.g. a typo'd or delisted ticker). Carries
// a `statusCode` so the Express error middleware (see app.ts) can return a
// 4xx instead of a generic 500, letting the frontend show a distinct message
// like "Could not find symbol XYZ" instead of a silent failure.
export class SymbolNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(symbol: string) {
    super(`Symbol not found: ${symbol}`);
    this.name = 'SymbolNotFoundError';
  }
}
