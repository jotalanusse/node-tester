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
import { LogMessage, Message, MessageWrapper } from './messages/messages';

// Constants
const MAX_CONCURRENT_TRANSACTIONS = 10;
const MAX_ROLLING_WINDOW_SIZE_MS = 1000 * 60 * 60; // 1 hour

// State
const { id, nodeConfigs, uuidConfigs } = workerData as WorkerData;

const nodes: Node[] = [];
const accounts: Account[] = [];

const transactionsSemaphore = new Semaphore(MAX_CONCURRENT_TRANSACTIONS);
const transactionsRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransactionsRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

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

// TODO: This is just a test function to send trasnactions
const executeOrder = async () => {
  const node = getRandomNode(nodes)!;
  const klyraClient = node.klyraClient!;

  accounts.sort(
    (a, b) =>
      a.lastBlockTransfered.timestamp.getTime() -
      b.lastBlockTransfered.timestamp.getTime(),
  );

  const accountA = accounts[0]!;
  const accountB = accounts[1]!;

  const subaccountA = new WalletSubaccountInfo(accountA.wallet, 0);
  const subaccountB = new WalletSubaccountInfo(accountB.wallet, 0);

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
  accountA.lastBlockTransfered.setTimestamp(new Date());
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
  accountB.lastBlockTransfered.setTimestamp(new Date());
  transactionsRollingWindow.record();

  const parsedHashA = Buffer.from(transactionA.hash).toString('hex');
  sendLogMessage(
    `Transaction A sent with hash [${parsedHashA}] for account [${
      accounts[0]!.name
    }]`,
  );
  // console.log(transactionA);

  const parsedHashB = Buffer.from(transactionB.hash).toString('hex');
  sendLogMessage(
    `Transaction B sent with hash [${parsedHashB}] for account [${
      accounts[1]!.name
    }]`,
  );
  // console.log(transactionB);
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
          sendLogMessage(`Error in executeOrder: ${error.message}`);
          console.error(error);

          transactionsSemaphore.release();
        });

      await delay(0);
    } else {
      await delay(5);
    }
  }
};

main();
