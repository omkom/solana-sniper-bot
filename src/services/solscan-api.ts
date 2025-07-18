import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface SolscanTokenBalanceChange {
  token_address: string;
  token_symbol?: string;
  token_name?: string;
  token_decimals: number;
  balance_change: string;
  pre_balance?: string;
  post_balance?: string;
  owner: string;
}

export interface SolscanSolBalanceChange {
  address: string;
  change_amount: number;
  pre_balance: number;
  post_balance: number;
}

export interface SolscanParsedInstruction {
  program_id: string;
  program_name?: string;
  instruction_name?: string;
  inner_instructions?: any[];
  parsed_data?: any;
  raw_data?: string;
}

export interface SolscanTransactionDetail {
  success: boolean;
  data: {
    tx_hash: string;
    block_id: number;
    block_time: number;
    fee: number;
    status: number; // 1 = success, 0 = error
    sol_bal_change: SolscanSolBalanceChange[];
    token_bal_change: SolscanTokenBalanceChange[];
    parsed_instructions: SolscanParsedInstruction[];
    programs_involved: string[];
    compute_units_consumed: number;
    priority_fee?: number;
    signer?: string[];
    signatures?: string[];
    log_messages?: string[];
    error?: string;
  };
}

export interface SolscanApiConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export class SolscanApiClient {
  private client: AxiosInstance;
  private apiKey: string | undefined;
  private retries: number;
  private retryDelay: number;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private rateLimitDelay: number = 100; // 100ms between requests

  constructor(config: SolscanApiConfig = {}) {
    this.apiKey = config.apiKey || process.env.SOLSCAN_API_KEY;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://pro-api.solscan.io',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'token': this.apiKey })
      }
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use((config) => {
      return this.handleRateLimit(config);
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleResponseError(error)
    );

    console.log('🔍 Solscan API client initialized', {
      hasApiKey: !!this.apiKey,
      baseUrl: config.baseUrl || 'https://pro-api.solscan.io',
      retries: this.retries
    });
  }

  /**
   * Rate limiting to respect Solscan API limits
   */
  private async handleRateLimit(config: any): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
    
    return config;
  }

  /**
   * Handle response errors with retry logic
   */
  private async handleResponseError(error: any): Promise<any> {
    if (error.response?.status === 429) {
      console.log('⚠️ Rate limit hit, backing off...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (error.response?.status === 401) {
      console.error('❌ Solscan API authentication failed - check your API key');
    }
    
    return Promise.reject(error);
  }

  /**
   * Get detailed transaction information from Solscan
   */
  async getTransactionDetail(txSignature: string): Promise<SolscanTransactionDetail | null> {
    console.log(`🔍 [SOLSCAN] Fetching transaction detail: ${txSignature.slice(0, 8)}...`);
    
    try {
      const response: AxiosResponse<SolscanTransactionDetail> = await this.withRetry(
        () => this.client.get(`/v2.0/transaction/detail`, {
          params: { tx: txSignature }
        })
      );

      if (response.data.success) {
        console.log(`✅ [SOLSCAN] Transaction detail fetched successfully`);
        console.log(`📊 [SOLSCAN] Token balance changes: ${response.data.data.token_bal_change?.length || 0}`);
        console.log(`📊 [SOLSCAN] SOL balance changes: ${response.data.data.sol_bal_change?.length || 0}`);
        console.log(`📊 [SOLSCAN] Programs involved: ${response.data.data.programs_involved?.length || 0}`);
        
        return response.data;
      } else {
        console.log(`❌ [SOLSCAN] API returned success: false for ${txSignature}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ [SOLSCAN] Error fetching transaction detail:`, error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.log(`⚠️ [SOLSCAN] Transaction not found: ${txSignature}`);
        } else if (error.response?.status === 429) {
          console.log(`⚠️ [SOLSCAN] Rate limit exceeded`);
        } else {
          console.log(`❌ [SOLSCAN] HTTP ${error.response?.status}: ${error.response?.statusText}`);
        }
      }
      
      return null;
    }
  }

  /**
   * Extract new tokens from Solscan transaction detail
   */
  extractNewTokensFromTransaction(transactionDetail: SolscanTransactionDetail): SolscanTokenBalanceChange[] {
    if (!transactionDetail.success || !transactionDetail.data.token_bal_change) {
      return [];
    }

    const tokenChanges = transactionDetail.data.token_bal_change;
    
    // Filter for new tokens (tokens with positive balance changes or new accounts)
    const newTokens = tokenChanges.filter(change => {
      // Look for tokens with positive balance changes (indicating new tokens or mints)
      const balanceChange = parseFloat(change.balance_change);
      const preBalance = parseFloat(change.pre_balance || '0');
      
      // Consider it a new token if:
      // 1. Previous balance was 0 and current balance is positive
      // 2. Balance change is positive and significant
      return (preBalance === 0 && balanceChange > 0) || balanceChange > 0;
    });

    console.log(`🔍 [SOLSCAN] Found ${newTokens.length} potential new tokens from ${tokenChanges.length} total token changes`);
    
    return newTokens;
  }

  /**
   * Extract detailed token information including metadata
   */
  extractTokenInformation(transactionDetail: SolscanTransactionDetail): {
    newTokens: SolscanTokenBalanceChange[];
    programsInvolved: string[];
    instructionTypes: string[];
    liquidityInfo: {
      solChanges: SolscanSolBalanceChange[];
      totalSolMovement: number;
      estimatedLiquidityUsd: number;
    };
    transactionMeta: {
      blockTime: number;
      fee: number;
      status: number;
      computeUnits: number;
    };
  } {
    const newTokens = this.extractNewTokensFromTransaction(transactionDetail);
    const data = transactionDetail.data;
    
    // Calculate SOL movement for liquidity estimation
    const totalSolMovement = data.sol_bal_change?.reduce((sum, change) => {
      return sum + Math.abs(change.change_amount);
    }, 0) || 0;
    
    // Extract instruction types for analysis
    const instructionTypes = data.parsed_instructions?.map(instr => 
      instr.instruction_name || instr.program_name || 'unknown'
    ) || [];

    return {
      newTokens,
      programsInvolved: data.programs_involved || [],
      instructionTypes,
      liquidityInfo: {
        solChanges: data.sol_bal_change || [],
        totalSolMovement: totalSolMovement / 1e9, // Convert lamports to SOL
        estimatedLiquidityUsd: (totalSolMovement / 1e9) * 150 // Rough SOL price
      },
      transactionMeta: {
        blockTime: data.block_time,
        fee: data.fee,
        status: data.status,
        computeUnits: data.compute_units_consumed
      }
    };
  }

  /**
   * Check if a transaction contains token creation/launch patterns
   */
  isTokenCreationTransaction(transactionDetail: SolscanTransactionDetail): boolean {
    if (!transactionDetail.success) return false;
    
    const data = transactionDetail.data;
    
    // Check for token creation programs
    const tokenCreationPrograms = [
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token 2022 Program
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    ];
    
    const hasTokenProgram = data.programs_involved?.some(program => 
      tokenCreationPrograms.includes(program)
    ) || false;
    
    // Check for token creation instructions
    const tokenCreationInstructions = [
      'initializeMint',
      'initializeMint2', 
      'create',
      'initialize',
      'createPool'
    ];
    
    const hasTokenInstruction = data.parsed_instructions?.some(instr =>
      tokenCreationInstructions.some(tokenInstr => 
        instr.instruction_name?.toLowerCase().includes(tokenInstr.toLowerCase())
      )
    ) || false;
    
    // Check if we have new token balance changes
    const hasNewTokens = this.extractNewTokensFromTransaction(transactionDetail).length > 0;
    
    return hasTokenProgram && (hasTokenInstruction || hasNewTokens);
  }

  /**
   * Retry mechanism for API calls
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retries) {
          break;
        }
        
        // Don't retry on certain errors
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401 || error.response?.status === 403) {
            break; // Don't retry auth errors
          }
          if (error.response?.status === 404) {
            break; // Don't retry not found
          }
        }
        
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⏳ [SOLSCAN] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Get API usage statistics
   */
  getUsageStats(): {
    requestCount: number;
    hasApiKey: boolean;
    rateLimitDelay: number;
  } {
    return {
      requestCount: this.requestCount,
      hasApiKey: !!this.apiKey,
      rateLimitDelay: this.rateLimitDelay
    };
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use a known transaction hash for testing
      const testTx = '2wihpMnQU5XJdmCLh2YFHp2jKqhvFLLHc9Y4MFbMj9iYRGKwJPnPqJT7R2MVjCRJe8k7pXj1cMPRwwKN2qGVgpEc';
      const result = await this.getTransactionDetail(testTx);
      return result !== null;
    } catch (error) {
      console.error('❌ [SOLSCAN] Connection test failed:', error);
      return false;
    }
  }
}