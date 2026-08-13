import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StockApiService } from './stock-api.service';

describe('StockApiService', () => {
  let service: StockApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StockApiService]
    });
    service = TestBed.inject(StockApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getPortfolio GETs /api/portfolio', () => {
    service.getPortfolio().subscribe();
    const req = httpMock.expectOne('/api/portfolio');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('addToPortfolio POSTs /api/portfolio/:symbol', () => {
    service.addToPortfolio('AAPL').subscribe();
    const req = httpMock.expectOne('/api/portfolio/AAPL');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('removeFromWatchlist DELETEs /api/watchlist/:symbol', () => {
    service.removeFromWatchlist('AAPL').subscribe();
    const req = httpMock.expectOne('/api/watchlist/AAPL');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('refreshMany POSTs /api/tickers/refresh with symbols body', () => {
    service.refreshMany(['AAPL', 'MSFT']).subscribe();
    const req = httpMock.expectOne('/api/tickers/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ symbols: ['AAPL', 'MSFT'] });
    req.flush([]);
  });

  it('refreshAll POSTs /api/tickers/refresh-all', () => {
    service.refreshAll().subscribe();
    const req = httpMock.expectOne('/api/tickers/refresh-all');
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });

  it('encodes symbols with special characters (e.g. index symbols like ^BSESN) in the URL', () => {
    service.addToPortfolio('^BSESN').subscribe();
    const req = httpMock.expectOne('/api/portfolio/%5EBSESN');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('encodes symbols with special characters when refreshing one', () => {
    service.refreshOne('^BSESN').subscribe();
    const req = httpMock.expectOne('/api/tickers/%5EBSESN/refresh');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
