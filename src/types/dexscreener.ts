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
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  pairCreatedAt?: number;
  marketCap?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{
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

export interface DexScreenerTokenData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  pairs: DexScreenerPair[];
}

export interface RealTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: string;
  price: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  marketCap?: number;
  age: number;
  source: string;
  pair?: DexScreenerPair;
  trendingScore?: number;
  priceUsd?: number;
  priceNative?: string;
  chainId?: string;
  detected?: boolean;
  detectedAt?: number;
  volume1h?: number;
  volume5m?: number;
  txns24h?: number;
  txns1h?: number;
  txns5m?: number;
  createdAt?: number;
  metadata?: any;
  dexId?: string;
  liquidityUsd?: number;
  priceChange5m?: number;
  priceChange1h?: number;
  fdv?: number;
  pairAddress?: string;
  pairCreatedAt?: number;
  buys?: number;
  sells?: number;
  holders?: number;
  website?: string;
  websites?: string[];
  socials?: any[];
  twitter?: string;
  telegram?: string;
  description?: string;
  imageUrl?: string;
  coingeckoId?: string;
  coinmarketcapId?: string;
  riskScore?: number;
}