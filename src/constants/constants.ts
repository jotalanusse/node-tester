// Time
export const SECOND_MS = 1000;
export const MINUTE_MS = SECOND_MS * 60;
export const HOUR_MS = MINUTE_MS * 60;
export const DAY_MS = HOUR_MS * 24;

// Accounts
export const GENERATED_ACCOUNTS = 1640; // Number of accounts to generate (max number of accounts with available funds is 1640!)
export const MINIMUM_ACCOUNT_BALANCE = 1000000; // Minimum balance for each account (account will be topped up if balance falls below this amount)

// Transactions
export const MAX_CONCURRENT_TRANSACTIONS = 15; // Max number of transactions that can be sent concurrently (per worker)
export const TRANSACTION_LOOP_DELAY_MS = 1; // Delay between transaction loops (allows the event loop to run I/O operations)

// Transfers
export const MAX_CONCURRENT_TRANSFERS = 10; // Max number of transfers that can be sent concurrently (per worker)

// Stats
export const MAX_ROLLING_WINDOW_SIZE_MS = HOUR_MS * 1; // Max size of the rolling window for stats
export const STATS_LOG_INTERVAL_MS = SECOND_MS; // Interval at which to log stats to the console
export const SEND_STATS_MESSAGE_INTERVAL_MS = 500; // Interval at which to send stats messages from the worker to the parent

// Blocks
export const BLOCK_QUERY_INTERVAL_MS = 25; // Interval at which to query the block height
