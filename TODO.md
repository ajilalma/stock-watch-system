# TODO

- Upgrade `yahoo-finance2` from v2 to v3. v2 is no longer maintained; see the [upgrade guide](https://github.com/gadicc/yahoo-finance2/blob/dev/docs/UPGRADING.md). Change is scoped to `backend/src/providers/yahoo-finance.provider.ts` since it's the only file that touches the library directly.
- Verify the `quoteSummary` `price` module's field names (`exchangeName` vs `fullExchangeName` vs `exchange`) against a real live response once Yahoo's rate limit clears — implemented with defensive fallback chains in `backend/src/providers/yahoo-finance.provider.ts` (`getQuote`) but not empirically confirmed the way the rest of the field mapping was. Check with e.g. `console.log(JSON.stringify(summary.price))` for AAPL.
