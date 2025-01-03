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
import { Account } from './account';
import { Node } from './node';
import { Semaphore } from './semaphore';

// Config
import { validatorAccountConfigs } from './config/validator-accounts.config';
import { nodeConfigs } from './config/nodes.config';
import { uuidConfigs } from './config/uuids.config';

// Constants
const GENERATED_ACCOUNTS = 10;
const MAX_CONCURRENT_TRANSACTIONS = 100;
const TRANSACTION_LOOP_DELAY_MS = 1; // TODO: Is there anything smaller than 1ms that allows the event loop to jump to other tasks?

const KLYRA_CLIENT_OPTIONS = {
  environment: {
    chainId: 'klyra-testnet',
    node: {
      rpc: 'http://1.1.1.1:26657', // This will be replaced by the actual node IP
    },
    indexer: {
      rest: 'https://demo-api.klyra.com',
      ws: 'wss://demo-api.klyra.com/v4/ws',
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

// State
const accounts: Account[] = [];
const nodes: Node[] = [];

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        price: 100000,
        size: 1,
        clientId: randomIntFromInterval(0, 100000000),
        timeInForce: OrderTimeInForce.GTT,
        // goodTilTimeInSeconds: 1000 * 60 * 60 * 24 * 365, // TODO: ???
        execution: OrderExecution.DEFAULT,
      });

      const transactionB = await klyraClient.placeCustomOrder({
        subaccount: subaccountB,
        ticker: 'BTC-USD',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        price: 100000,
        size: 1,
        clientId: randomIntFromInterval(0, 100000000),
        timeInForce: OrderTimeInForce.GTT,
        // goodTilTimeInSeconds: 1000 * 60 * 60 * 24 * 365, // TODO: ???
        execution: OrderExecution.DEFAULT,
      });

      const parsedHashA = Buffer.from(transactionA.hash).toString('hex');
      console.log(`Transaction A sent with hash [${parsedHashA}]`);

      const parsedHashB = Buffer.from(transactionB.hash).toString('hex');
      console.log(`Transaction B sent with hash [${parsedHashB}]`);
    } catch (error) {
      console.error('Error while creating transaction!');
      console.error(error);
    }
  };

  const semaphore = new Semaphore(MAX_CONCURRENT_TRANSACTIONS);

  while (true) {
    if (semaphore.getAvailablePermits() > 0) {
      semaphore.acquire();

      executeOrder().then(() => {
        semaphore.release();
      });
    }

    await delay(TRANSACTION_LOOP_DELAY_MS); // Allow the event loop to jump to other tasks
  }
};

main();
