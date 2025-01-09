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
import {
  createKlyraClient,
  formatNumber,
  formatTime,
  getRandomNode,
  randomIntFromInterval,
} from './utils/utils';
import { spawnWorkers } from './parent';

// Constants
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

const GENERATED_ACCOUNTS = 1640;
const MAX_CONCURRENT_TRANSACTIONS = 10;
const MAX_CONCURRENT_TRANSFERS = 10;
// const TRANSACTION_LOOP_DELAY_MS = 1; // TODO: Is there anything smaller than 1ms that allows the event loop to jump to other tasks?
const MAX_ROLLING_WINDOW_SIZE_MS = 1000 * 60 * 60; // 1 hour
const STATS_LOG_INTERVAL_MS = 1000; // 1 second
const BLOCK_QUERY_INTERVAL_MS = 25; // 25 milliseconds
const MINIMUM_ACCOUNT_BALANCE = 1000000; // 1,000,000 tDai

// Global State
const startTime = Date.now();
const accounts: Account[] = [];
const nodes: Node[] = [];

const transactionsSemaphore = new Semaphore(MAX_CONCURRENT_TRANSACTIONS);
const transfersSemaphore = new Semaphore(MAX_CONCURRENT_TRANSFERS);

const failedTransactionsRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

const transfersRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransfersRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

const blocksRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);

let lastBlockHeightQuery = 0;
let lastBlockHeight = 0;

let lastStatsLog = 0;

// Functions
// const transferTDai = async (klyraClient: Klyra) => {
//   let senderAccounts = accounts.filter(
//     (account) => account.tDaiBalance.amount >= MINIMUM_ACCOUNT_BALANCE * 5, // TODO: Remove the 5x!
//   );
//   senderAccounts = senderAccounts.filter(
//     (account) => account.lastBlockTransacted < lastBlockHeight,
//   );
//   senderAccounts.sort((a, b) => b.tDaiBalance.amount - a.tDaiBalance.amount);

//   if (senderAccounts.length === 0) {
//     // No accounts have enough balance to transfer
//     return;
//   }

//   const receiverAccounts = accounts.filter(
//     (account) => account.tDaiBalance.amount <= MINIMUM_ACCOUNT_BALANCE,
//   );
//   receiverAccounts.sort((a, b) => a.tDaiBalance.amount - b.tDaiBalance.amount);

//   if (receiverAccounts.length === 0) {
//     // No accounts have low enough balance to receive
//     return;
//   }

//   const sender = senderAccounts[0]!;
//   const receiver = receiverAccounts[0]!;

//   const amount = Math.min(
//     sender.tDaiBalance.amount - MINIMUM_ACCOUNT_BALANCE,
//     MINIMUM_ACCOUNT_BALANCE,
//   );

//   try {
//     await sender.transferTDai(klyraClient, receiver.address, amount.toString());
//     transfersRollingWindow.record();

//     sender.tDaiBalance.subtractAmount(amount);
//     receiver.tDaiBalance.addAmount(amount);

//     sender.lastBlockTransfered = lastBlockHeight;
//   } catch (error) {
//     failedTransfersRollingWindow.record();
//     console.error('Error while creating transfer!');
//     console.error(error);
//   }
// };

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
    const node = getRandomNode(nodes)!;
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
  // for (let i = 1395; i < uuidConfigs.length; i++) {
  //   const node = getRandomNode(nodes)!;
  //   const klyraClient = node.klyraClient!;

  //   const uuid = uuidConfigs[i]!;

  //   const account = await Account.fromUUID(klyraClient, uuid);
  //   await account.updateTDaiBalanceFromNode(klyraClient);

  //   accounts.push(account);
  //   console.log(
  //     `Account number [${i}] with name [${account.name}] created with address [${account.address}] and tDai balance [${account.tDaiBalance.amount}]`,
  //   );

  //   if (account.tDaiBalance.amount < MINIMUM_ACCOUNT_BALANCE) {
  //     const transferAmount =
  //       MINIMUM_ACCOUNT_BALANCE - account.tDaiBalance.amount;

  //     await accounts[1]?.transferTDai(
  //       klyraClient,
  //       account.address,
  //       transferAmount.toString(),
  //     );
  //   }
  // }

  const slicedUuidConfigs = uuidConfigs.slice(0, GENERATED_ACCOUNTS);
  spawnWorkers(nodeConfigs, slicedUuidConfigs);

  // const loop = async () => {
  //   // Transactions
  //   if (transactionsSemaphore.getAvailablePermits() > 0) {
  //     transactionsSemaphore.acquire();

  //     executeOrder().then(() => {
  //       transactionsSemaphore.release();
  //     });
  //   }

  //   // Query block height
  //   if (lastBlockHeightQuery + BLOCK_QUERY_INTERVAL_MS < Date.now()) {
  //     const node = getRandomNode(nodes)!;
  //     const klyraClient = node.klyraClient!;

  //     queryBlockHeight(klyraClient);
  //   }

  //   // Stats log
  //   if (lastStatsLog + STATS_LOG_INTERVAL_MS < Date.now()) {
  //     console.log(
  //       `[${formatTime(
  //         (Date.now() - startTime) / 1000,
  //       )}] Transaction stats (successful/failed): 1s [${formatNumber(
  //         transactionsRollingWindow.getCount(1000),
  //       )}/${formatNumber(
  //         failedTransactionsRollingWindow.getCount(1000),
  //       )}] | 1m [${formatNumber(
  //         transactionsRollingWindow.getCount(1000 * 60),
  //       )}/${formatNumber(
  //         failedTransactionsRollingWindow.getCount(1000 * 60),
  //       )}] | 5m [${formatNumber(
  //         transactionsRollingWindow.getCount(1000 * 60 * 5),
  //       )}/${formatNumber(
  //         failedTransactionsRollingWindow.getCount(1000 * 60 * 5),
  //       )}]`,
  //     );

  //     console.log(
  //       `[${formatTime(
  //         (Date.now() - startTime) / 1000,
  //       )}] Transfer stats (successful/failed): 1s [${formatNumber(
  //         transfersRollingWindow.getCount(1000),
  //       )}/${formatNumber(
  //         failedTransfersRollingWindow.getCount(1000),
  //       )}] | 1m [${formatNumber(
  //         transfersRollingWindow.getCount(1000 * 60),
  //       )}/${formatNumber(
  //         failedTransfersRollingWindow.getCount(1000 * 60),
  //       )}] | 5m [${formatNumber(
  //         transfersRollingWindow.getCount(1000 * 60 * 5),
  //       )}/${formatNumber(
  //         failedTransfersRollingWindow.getCount(1000 * 60 * 5),
  //       )}]`,
  //     );

  //     console.log(
  //       `[${formatTime(
  //         (Date.now() - startTime) / 1000,
  //       )}] Block stats: 1s [${formatNumber(
  //         blocksRollingWindow.getCount(1000),
  //       )}] | 1m [${formatNumber(
  //         blocksRollingWindow.getCount(1000 * 60),
  //       )}] | 5m [${formatNumber(
  //         blocksRollingWindow.getCount(1000 * 60 * 5),
  //       )}]`,
  //     );

  //     lastStatsLog = Date.now();
  //   }

  // setImmediate(loop);
  // };

  // loop();
};

main();
