// DexScreener API Response Types

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: {
      buys: number;
      sells: number;
    };
    h1: {
      buys: number;
      sells: number;
    };
    h6: {
      buys: number;
      sells: number;
    };
    h24: {
      buys: number;
      sells: number;
    };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd?: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{
      label: string;
      url: string;
    }>;
    socials?: Array<{
      type: string;
      url: string;
    }>;
  };
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

export interface RealTokenInfo {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  priceNative: string;
  volume24h: number;
  volume1h: number;
  volume5m: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange5m: number;
  liquidityUsd: number;
  marketCap?: number;
  fdv?: number;
  txns24h: number;
  txns1h: number;
  txns5m: number;
  pairAddress: string;
  dexId: string;
  pairCreatedAt?: number;
  imageUrl?: string;
  websites?: string[];
  socials?: Array<{
    type: string;
    url: string;
  }>;
  // Additional fields for analysis
  trendingScore?: number;
  riskScore?: number;
  detected: boolean;
  detectedAt: number;
}

export interface MarketFilters {
  chainIds: string[];
  dexIds: string[];
  rankBy: 'trendingScoreM5' | 'volumeM5' | 'priceChangeM5' | 'liquidityUsd';
  order: 'desc' | 'asc';
  minLiquidity?: number;
  maxAge?: number; // hours
  minVolume?: number;
}