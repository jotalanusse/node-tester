import { WorkerData } from './interfaces/worker-data.interface';
import { parentPort, workerData } from 'worker_threads';
import {
  createKlyraClient,
  delay,
  formatTime,
  getRandomNode,
  randomIntFromInterval,
} from './utils/utils';
import { Node } from './class/node';
import { Account } from './class/account';
import { Semaphore } from './class/semaphore';
import {
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  WalletSubaccountInfo,
} from '@klyra/core';
import { RollingWindow } from './class/rolling-window';
import {
  LogMessage,
  Message,
  MessageWrapper,
  StatsMessage,
} from './messages/messages';
import {
  MAX_CONCURRENT_TRANSACTIONS,
  MAX_ROLLING_WINDOW_SIZE_MS,
  SEND_STATS_MESSAGE_INTERVAL_MS,
} from './constants/constants';

// State
const { id, nodeConfigs, uuidConfigs } = workerData as WorkerData;

const nodes: Node[] = [];
const accounts: Account[] = [];

const transactionsSemaphore = new Semaphore(MAX_CONCURRENT_TRANSACTIONS);
const transactionsRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransactionsRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

let lastStatsMessageSent = Date.now();

// Functions
const sendMessage = (message: Message) => {
  const messageWrapper: MessageWrapper = {
    type: message.type,
    workerId: id,
    message,
  };

  parentPort?.postMessage(messageWrapper);
};

const sendLogMessage = (message: string) => {
  const logMessage = new LogMessage(message);

  sendMessage(logMessage);
};

const sendStatsMessage = () => {
  const statsMessage = new StatsMessage({
    transactions: {
      successful: transactionsRollingWindow.drain(),
      failed: failedTransactionsRollingWindow.drain(),
    },
  });

  sendMessage(statsMessage);
};

const executeOrder = async () => {
  const node = getRandomNode(nodes)!;
  const klyraClient = node.klyraClient!;

  const notTransactingAccounts = accounts.filter(
    ({ state }) => !state.isTransacting,
  );

  if (notTransactingAccounts.length < 2) {
    // There are not enough accounts to transact
    return;
  }

  // Prefer the accounts that haven't transacted for the longest time
  notTransactingAccounts.sort(
    (a, b) =>
      a.state.lastTransactionTime.getTime() -
      b.state.lastTransactionTime.getTime(),
  );

  const accountA = notTransactingAccounts[0]!;
  const accountB = notTransactingAccounts[1]!;

  const subaccountA = new WalletSubaccountInfo(accountA.wallet, 0);
  const subaccountB = new WalletSubaccountInfo(accountB.wallet, 0);

  accountA.state.isTransacting = true;
  accountB.state.isTransacting = true;

  try {
    const blockHeight = await klyraClient
      .getChainClient()
      .nodeClient.get.latestBlockHeight();

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
      goodTilBlock: blockHeight + 20,
      execution: OrderExecution.DEFAULT,
      postOnly: true,
    });
    accountA.state.timesTransacted++;
    accountA.state.lastTransactionTime = new Date();
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
      goodTilBlock: blockHeight + 20,
      execution: OrderExecution.DEFAULT,
      postOnly: true,
    });
    accountB.state.timesTransacted++;
    accountB.state.lastTransactionTime = new Date();
    transactionsRollingWindow.record();

    // const parsedHashA = Buffer.from(transactionA.hash).toString('hex');
    // sendLogMessage(
    //   `Transaction A sent with hash [${parsedHashA}] for account [${
    //     accounts[0]!.name
    //   }]`,
    // );

    // const parsedHashB = Buffer.from(transactionB.hash).toString('hex');
    // sendLogMessage(
    //   `Transaction B sent with hash [${parsedHashB}] for account [${
    //     accounts[1]!.name
    //   }]`,
    // );
  } catch (error: any) {
    failedTransactionsRollingWindow.record();

    console.error(error);
  } finally {
    accountA.state.isTransacting = false;
    accountB.state.isTransacting = false;
  }
};

// Main
const main = async () => {
  sendLogMessage(`Worker started with [${uuidConfigs.length}] accounts`);

  // Setup nodes
  for (const nodeConfig of nodeConfigs) {
    const klyraClient = createKlyraClient(nodeConfig);
    const node = new Node(nodeConfig.ip, klyraClient);

    await node.klyraClient.initialize();

    nodes.push(node);
  }

  // Setup generated accounts
  for (let i = 0; i < uuidConfigs.length; i++) {
    const node = getRandomNode(nodes)!;
    const klyraClient = node.klyraClient!;

    const uuid = uuidConfigs[i]!;

    const account = await Account.fromUUID(klyraClient, uuid);
    await account.updateTDaiBalanceFromNode(klyraClient);

    accounts.push(account);
    sendLogMessage(
      `Account number [${i}] with name [${account.name}] created with address [${account.address}] and tDai balance [${account.tDaiBalance.amount}]`,
    );
  }

  sendLogMessage(
    `Worker initialized transaction loop with [${accounts.length}] accounts`,
  );

  while (true) {
    if (transactionsSemaphore.getAvailablePermits() > 0) {
      transactionsSemaphore.acquire();

      executeOrder()
        .then(() => {
          transactionsSemaphore.release();
        })
        .catch((error: any) => {
          // sendLogMessage(`Error in executeOrder: ${error.message}`);
          // console.error(error);

          transactionsSemaphore.release();
        });

      await delay(0); // Allow the event loop to jump to I/O tasks
    } else {
      await delay(5); // Don't cook CPU while waiting
    }

    if (lastStatsMessageSent + SEND_STATS_MESSAGE_INTERVAL_MS < Date.now()) {
      sendStatsMessage();
      lastStatsMessageSent = Date.now();
    }
  }
};

main();
