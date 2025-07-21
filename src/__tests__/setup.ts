/**
 * Test setup and configuration
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.MODE = 'DRY_RUN';
process.env.RPC_PRIMARY = 'https://api.mainnet-beta.solana.com';
process.env.RPC_SECONDARY = 'https://api.mainnet-beta.solana.com';
process.env.MIN_LIQUIDITY_SOL = '0.5';
process.env.MIN_CONFIDENCE_SCORE = '5';
process.env.SIMULATED_INVESTMENT = '0.003';
process.env.STARTING_BALANCE = '10';
process.env.DASHBOARD_PORT = '3001'; // Different port for tests

// Mock console methods to reduce noise in tests
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
});

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies
jest.mock('axios');
jest.mock('ws');
jest.mock('socket.io');
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getSlot: jest.fn().mockResolvedValue(1000),
    getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'test', lastValidBlockHeight: 1000 }),
    onLogs: jest.fn().mockReturnValue(1),
    removeOnLogsListener: jest.fn(),
    getTransaction: jest.fn().mockResolvedValue(null),
    getSignaturesForAddress: jest.fn().mockResolvedValue([]),
    getParsedTransaction: jest.fn().mockResolvedValue(null)
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({ toString: () => key })),
  Logs: jest.fn()
}));

export {};