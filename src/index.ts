import { spawnWorkers } from './parent';
import { createKlyraClient, getRandomNode } from './utils/utils';
import { Account } from './class/account';
import { Node } from './class/node';
import { GENERATED_ACCOUNTS } from './constants/constants';
import { validatorAccountConfigs } from './config/validator-accounts.config';
import { nodeConfigs } from './config/nodes.config';
import { uuidConfigs } from './config/uuids.config';

// State
const accounts: Account[] = [];
const nodes: Node[] = [];

// Main
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
  // for (let i = 0; i < GENERATED_ACCOUNTS; i++) {
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
