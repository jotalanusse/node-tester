import { performance } from 'node:perf_hooks';
import {
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  Klyra,
  WalletSubaccountInfo,
} from '@klyra/core';

// Interfaces
import { NodeConfig } from './interfaces/node-config.interface';

// Classes
import { Account } from './class/account';
import { Node } from './class/node';
import { Semaphore } from './class/semaphore';

// Config
import { validatorAccountConfigs } from './config/validator-accounts.config';
import { nodeConfigs } from './config/nodes.config';
import { uuidConfigs } from './config/uuids.config';
import { RollingWindow } from './class/rolling-window';
import { SlowBuffer } from 'node:buffer';

// Constants
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

const GENERATED_ACCOUNTS = 10;
const MAX_CONCURRENT_TRANSACTIONS = 10;
const MAX_CONCURRENT_TRANSFERS = 10;
// const TRANSACTION_LOOP_DELAY_MS = 1; // TODO: Is there anything smaller than 1ms that allows the event loop to jump to other tasks?
const MAX_ROLLING_WINDOW_SIZE_MS = 1000 * 60 * 60; // 1 hour
const MAX_BLOCKS_ROLLING_WINDOW_SIZE_MS = 1000 * 60 * 60; // 1 hour
const STATS_LOG_INTERVAL_MS = 1000; // 1 second
const BLOCK_QUERY_INTERVAL_MS = 25; // 25 milliseconds
const MINIMUM_ACCOUNT_BALANCE = 10000000; // 10,000,000 tDai

const KLYRA_CLIENT_OPTIONS = {
  environment: {
    chainId: 'klyra-testnet',
    node: {
      rpc: 'http://1.1.1.1:26657', // This will be replaced by the actual node IP
    },
    indexer: {
      // rest: 'https://demo-api.klyra.com',
      // ws: 'wss://demo-api.klyra.com/v4/ws',
      rest: 'https://test.com',
      ws: 'wss://test.com/v4/ws',
    },
  },
  websocket: {
    subscribeOnConnect: false,
  },
  fees: {
    subaccountNumber: 0,
    feePpm: 0, // TODO: maybe set this to a higher value?
    address: 'klyra199tqg4wdlnu4qjlxchpd7seg454937hju8xa57', // Use Alice's address
  },
};

// Global State
const startTime = Date.now();
const accounts: Account[] = [];
const nodes: Node[] = [];

const transactionsSemaphore = new Semaphore(MAX_CONCURRENT_TRANSACTIONS);
const transfersSemaphore = new Semaphore(MAX_CONCURRENT_TRANSFERS);

const transactionsRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransactionsRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

const transfersRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransfersRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

const blocksRollingWindow = new RollingWindow(
  MAX_BLOCKS_ROLLING_WINDOW_SIZE_MS,
);

let lastBlockHeightQuery = 0;
let lastBlockHeight = 0;

let lastStatsLog = 0;

// Functions
const createKlyraClient = (nodeConfig: NodeConfig): Klyra => {
  const klyraClient = new Klyra({
    ...KLYRA_CLIENT_OPTIONS,
    environment: {
      ...KLYRA_CLIENT_OPTIONS.environment,
      node: {
        ...KLYRA_CLIENT_OPTIONS.environment.node,
        rpc: `http://${nodeConfig.ip}:${nodeConfig.port}`,
      },
    },
  });

  return klyraClient;
};

const randomIntFromInterval = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const getRandomNode = (): Node | undefined => {
  const index = Math.floor(Math.random() * nodes.length);
  return nodes[index];
};

const getRandomAccount = (): Account => {
  const index = Math.floor(Math.random() * accounts.length);
  return accounts[index]!;
};

const formatTime = (seconds: number) => {
  const pad = (num: number) => (num < 10 ? `0${num}` : num);

  const H = pad(Math.floor(seconds / 3600));
  const i = pad(Math.floor((seconds % 3600) / 60));
  const s = pad(Math.floor(seconds % 60));

  return `${H}:${i}:${s}`;
};

const formatNumber = (num: number): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    return num.toString();
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const queryBlockHeight = async (klyraClient: Klyra) => {
  const blockHeight = await klyraClient
    .getChainClient()
    .nodeClient.get.latestBlockHeight();

  if (blockHeight > lastBlockHeight) {
    lastBlockHeight = blockHeight;
    blocksRollingWindow.record();
  }
};

const transferTDai = async () => {
  const node = getRandomNode()!;
  const klyraClient = node.klyraClient!;

  let senderAccounts = accounts.filter(
    (account) => account.tDaiBalance.amount >= MINIMUM_ACCOUNT_BALANCE * 5, // TODO: Remove the 5x!
  );
  senderAccounts = senderAccounts.filter(
    (account) => account.lastBlockTransacted < lastBlockHeight,
  );
  senderAccounts.sort((a, b) => b.tDaiBalance.amount - a.tDaiBalance.amount);

  if (senderAccounts.length === 0) {
    // No accounts have enough balance to transfer
    return;
  }

  const receiverAccounts = accounts.filter(
    (account) => account.tDaiBalance.amount <= MINIMUM_ACCOUNT_BALANCE,
  );
  receiverAccounts.sort((a, b) => a.tDaiBalance.amount - b.tDaiBalance.amount);

  if (receiverAccounts.length === 0) {
    // No accounts have low enough balance to receive
    return;
  }

  const sender = senderAccounts[0]!;
  const receiver = receiverAccounts[0]!;

  const amount = Math.min(
    sender.tDaiBalance.amount - MINIMUM_ACCOUNT_BALANCE,
    MINIMUM_ACCOUNT_BALANCE,
  );

  try {
    await sender.transferTDai(klyraClient, receiver.address, amount.toString());
    transfersRollingWindow.record();

    sender.tDaiBalance.subtractAmount(amount);
    receiver.tDaiBalance.addAmount(amount);

    sender.lastBlockTransfered = lastBlockHeight;
  } catch (error) {
    failedTransfersRollingWindow.record();
    console.error('Error while creating transfer!');
    console.error(error);
  }
};

// TODO: This is just a test function to send trasnactions
const executeOrder = async () => {
  const node = getRandomNode()!;
  const klyraClient = node.klyraClient!;

  const subaccountA = new WalletSubaccountInfo(accounts[0]!.wallet, 0);
  const subaccountB = new WalletSubaccountInfo(accounts[1]!.wallet, 0);

  try {
    const transactionA = await klyraClient.placeCustomOrder({
      subaccount: subaccountA,
      ticker: 'BTC-USD',
      type: OrderType.LIMIT, // TODO: This was a limit order!
      side: OrderSide.SELL,
      price: 100000,
      size: 0.0001,
      clientId: randomIntFromInterval(0, 100000000),
      timeInForce: OrderTimeInForce.GTT,
      goodTilTimeInSeconds: 1000 * 60 * 5, // TODO: ???
      execution: OrderExecution.DEFAULT,
      postOnly: true,
    });
    transactionsRollingWindow.record();

    const transactionB = await klyraClient.placeCustomOrder({
      subaccount: subaccountB,
      ticker: 'BTC-USD',
      type: OrderType.MARKET,
      side: OrderSide.BUY,
      price: 100001,
      size: 0.0001,
      clientId: randomIntFromInterval(0, 100000000),
      timeInForce: OrderTimeInForce.GTT,
      goodTilTimeInSeconds: 1000 * 60 * 5, // TODO: ???
      execution: OrderExecution.DEFAULT,
      postOnly: true,
    });
    transactionsRollingWindow.record();

    const parsedHashA = Buffer.from(transactionA.hash).toString('hex');
    console.log(
      `Transaction A sent with hash [${parsedHashA}] for account [${
        accounts[0]!.name
      }]`,
    );
    // console.log(transactionA);

    const parsedHashB = Buffer.from(transactionB.hash).toString('hex');
    console.log(
      `Transaction B sent with hash [${parsedHashB}] for account [${
        accounts[1]!.name
      }]`,
    );
    // console.log(transactionB);
  } catch (error) {
    failedTransactionsRollingWindow.record();
    console.error('Error while creating transaction!');
    console.error(error);
  }
};

const main = async () => {
  // Setup nodes
  for (const nodeConfig of nodeConfigs) {
    const klyraClient = createKlyraClient(nodeConfig);
    const node = new Node(nodeConfig.ip, klyraClient);

    await node.klyraClient.initialize();

    nodes.push(node);
  }

  // Setup validator accounts
  for (const validatorAccountConfig of validatorAccountConfigs) {
    const node = getRandomNode()!;
    const klyraClient = node.klyraClient!;

    const account = await Account.fromMnemonic(
      validatorAccountConfig.name,
      validatorAccountConfig.mnemonic,
    );

    await account.updateTDaiBalanceFromNode(klyraClient);

    accounts.push(account);

    console.log(
      `Account [${account.name}] created with address [${account.address}] and tDai balance [${account.tDaiBalance.amount}]`,
    );
  }

  // Setup generated accounts
  for (let i = 0; i < GENERATED_ACCOUNTS; i++) {
    const node = getRandomNode()!;
    const klyraClient = node.klyraClient!;

    const uuid = uuidConfigs[i]!;

    const account = await Account.fromUUID(klyraClient, uuid);
    await account.updateTDaiBalanceFromNode(klyraClient);

    accounts.push(account);
    console.log(
      `Account [${account.name}] created with address [${account.address}] and tDai balance [${account.tDaiBalance.amount}]`,
    );
  }

  const loop = async () => {
    // Transactions
    if (transactionsSemaphore.getAvailablePermits() > 0) {
      transactionsSemaphore.acquire();

      executeOrder().then(() => {
        transactionsSemaphore.release();
      });
    }

    // Transfers
    // if (transfersSemaphore.getAvailablePermits() > 0) {
    //   transfersSemaphore.acquire();

    //   transferTDai().then(() => {
    //     transfersSemaphore.release();
    //   });
    // }

    // Query block height
    if (lastBlockHeightQuery + BLOCK_QUERY_INTERVAL_MS < Date.now()) {
      const node = getRandomNode()!;
      const klyraClient = node.klyraClient!;

      queryBlockHeight(klyraClient);
    }

    // Stats log
    if (lastStatsLog + STATS_LOG_INTERVAL_MS < Date.now()) {
      console.log(
        `[${formatTime(
          (Date.now() - startTime) / 1000,
        )}] Transaction stats (successful/failed): 1s [${formatNumber(
          transactionsRollingWindow.getCount(1000),
        )}/${formatNumber(
          failedTransactionsRollingWindow.getCount(1000),
        )}] | 1m [${formatNumber(
          transactionsRollingWindow.getCount(1000 * 60),
        )}/${formatNumber(
          failedTransactionsRollingWindow.getCount(1000 * 60),
        )}] | 5m [${formatNumber(
          transactionsRollingWindow.getCount(1000 * 60 * 5),
        )}/${formatNumber(
          failedTransactionsRollingWindow.getCount(1000 * 60 * 5),
        )}]`,
      );

      console.log(
        `[${formatTime(
          (Date.now() - startTime) / 1000,
        )}] Transfer stats (successful/failed): 1s [${formatNumber(
          transfersRollingWindow.getCount(1000),
        )}/${formatNumber(
          failedTransfersRollingWindow.getCount(1000),
        )}] | 1m [${formatNumber(
          transfersRollingWindow.getCount(1000 * 60),
        )}/${formatNumber(
          failedTransfersRollingWindow.getCount(1000 * 60),
        )}] | 5m [${formatNumber(
          transfersRollingWindow.getCount(1000 * 60 * 5),
        )}/${formatNumber(
          failedTransfersRollingWindow.getCount(1000 * 60 * 5),
        )}]`,
      );

      console.log(
        `[${formatTime(
          (Date.now() - startTime) / 1000,
        )}] Block stats: 1s [${formatNumber(
          blocksRollingWindow.getCount(1000),
        )}] | 1m [${formatNumber(
          blocksRollingWindow.getCount(1000 * 60),
        )}] | 5m [${formatNumber(
          blocksRollingWindow.getCount(1000 * 60 * 5),
        )}]`,
      );

      lastStatsLog = Date.now();
    }

    setImmediate(loop);
  };

  loop();
};

main();
