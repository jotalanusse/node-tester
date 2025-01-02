import {
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  TxResponsePromise,
} from '@klyra/core';
import { Klyra, WalletSubaccountInfo } from '@klyra/core';
import { UUIDS } from './uuids';
import { Account } from './account';
import { Node } from './node';

interface ValidatorAccountConfig {
  name: string;
  mnemonic: string;
}

interface NodeConfig {
  ip: string;
}

const GENERATED_ACCOUNTS = 4;
// const TOTAL_TRANSFERS = 100000;
// const MINIMUM_FUNDS = 1000;
// const TRANSFER_AMOUNT = 100000;

// let CURRENT_BLOCK = 0;

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

const validatorAccountConfigs: ValidatorAccountConfig[] = [
  {
    name: 'alice',
    mnemonic:
      'merge panther lobster crazy road hollow amused security before critic about cliff exhibit cause coyote talent happy where lion river tobacco option coconut small',
  },
  {
    name: 'bob',
    mnemonic:
      'color habit donor nurse dinosaur stable wonder process post perfect raven gold census inside worth inquiry mammal panic olive toss shadow strong name drum',
  },
  {
    name: 'carl',
    mnemonic:
      'school artefact ghost shop exchange slender letter debris dose window alarm hurt whale tiger find found island what engine ketchup globe obtain glory manage',
  },
  {
    name: 'dave',
    mnemonic:
      'switch boring kiss cash lizard coconut romance hurry sniff bus accident zone chest height merit elevator furnace eagle fetch quit toward steak mystery nest',
  },
];

const nodeConfigs: NodeConfig[] = [
  {
    ip: '52.67.127.42',
  },
  {
    ip: '18.230.122.234',
  },
  {
    ip: '18.230.82.255',
  },
  {
    ip: '54.233.47.16',
  },
];

const accounts: Account[] = [];
const nodes: Node[] = [];

const createKlyraClient = (nodeConfig: NodeConfig): Klyra => {
  const klyraClient = new Klyra({
    ...KLYRA_CLIENT_OPTIONS,
    environment: {
      ...KLYRA_CLIENT_OPTIONS.environment,
      node: {
        ...KLYRA_CLIENT_OPTIONS.environment.node,
        rpc: `http://${nodeConfig.ip}:26657`,
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

// const transferTDai = async (
//   klyraClient: Klyra,
//   accountA: Account,
//   accountB: Account,
//   amount: string,
// ) => {
//   const subaccount = new WalletSubaccountInfo(accountA.wallet!, 0);

//   const transaction = await klyraClient.transfer(
//     subaccount,
//     accountB.address,
//     0,
//     amount,
//   );

//   // TODO: research what is going on with this
//   // const test = await klyraClient.getChainClient().nodeClient.post.sendNativeToken(
//   //   subaccount,
//   //   accountB.address,
//   //   'utdai',
//   //   '10000000',
//   // );
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

    const uuid = UUIDS[i]!;

    const account = await Account.fromUUID(klyraClient, uuid);
    await account.updateTDaiBalanceFromNode(klyraClient);

    accounts.push(account);
    console.log(
      `Account [${account.name}] created with address [${account.address}] and tDai balance [${account.tDaiBalance.amount}]`,
    );
  }

  // TODO: This section is for testing and it is not well implemented
  // TODO: A more parallelized approach should be implemented to reach maximum throughput
  while (true) {
    const transactions: TxResponsePromise[] = [];

    for (let i = 0; i < 10; i++) {
      const node = getRandomNode()!;
      const klyraClient = node.klyraClient!;

      const subaccountA = new WalletSubaccountInfo(accounts[0]!.wallet, 0);
      const transactionA = klyraClient.placeCustomOrder({
        subaccount: subaccountA,
        ticker: 'BTC-USD',
        type: OrderType.MARKET,
        side: OrderSide.SELL,
        price: 100000,
        size: 1,
        clientId: randomIntFromInterval(0, 100000000),
        timeInForce: OrderTimeInForce.GTT,
        goodTilTimeInSeconds: 1000 * 60 * 60 * 24 * 365,
        execution: OrderExecution.DEFAULT,
      });

      // const subaccountB = new WalletSubaccountInfo(accounts[1]!.wallet, 0);
      // const transactionB = klyraClient.placeCustomOrder({
      //   subaccount: subaccountB,
      //   ticker: 'BTC-USD',
      //   type: OrderType.MARKET,
      //   side: OrderSide.BUY,
      //   price: 100000,
      //   size: 1,
      //   clientId: randomIntFromInterval(0, 100000000),
      //   timeInForce: OrderTimeInForce.GTT,
      //   goodTilTimeInSeconds: 1000 * 60 * 60 * 24 * 365,
      //   execution: OrderExecution.DEFAULT,
      // });

      transactions.push(transactionA);
      // transactions.push(transactionB);
    }

    const resolvedTransactions = await Promise.all(transactions);
    for (const transaction of resolvedTransactions) {
      const parsedHash = Buffer.from(transaction.hash).toString('hex');
      console.log(`Transaction created with hash [${parsedHash}]`);

      // const node = getRandomNode()!;
      // const klyraClient = node.klyraClient!;
      // const test = await klyraClient.getChainClient().nodeClient.get.getAccountBalances(accounts[0]!.address);
      // console.log(test);
    }
  }
};

main();
