import os from 'os';
import { Worker } from 'worker_threads';
import { formatNumber, formatTime } from './utils/utils';
import { RollingWindow } from './class/rolling-window';
import { WorkerData } from './interfaces/worker-data.interface';
import { NodeConfig } from './interfaces/node-config.interface';
import { MAX_ROLLING_WINDOW_SIZE_MS } from './constants/constants';
import {
  LogMessage,
  MessageType,
  MessageWrapper,
  StatsMessage,
} from './messages/messages';

// State
const transactionsRollingWindow = new RollingWindow(MAX_ROLLING_WINDOW_SIZE_MS);
const failedTransactionsRollingWindow = new RollingWindow(
  MAX_ROLLING_WINDOW_SIZE_MS,
);

// Handlers
const onWorkerMessage = (messageWrapper: MessageWrapper): void => {
  if (messageWrapper.type === MessageType.Log) {
    const logMessage = messageWrapper.message as LogMessage;

    const formattedMessage = `[${formatTime(
      new Date().getSeconds(),
    )}] [Worker ${messageWrapper.workerId}]: ${logMessage.message}`;

    console.log(formattedMessage);
  }

  if (messageWrapper.type === MessageType.Stats) {
    const statsMessage = messageWrapper.message as StatsMessage;

    const stats = statsMessage.stats;

    transactionsRollingWindow.record(stats.transactions.successful);
    failedTransactionsRollingWindow.record(stats.transactions.failed);
  }
};

const onWorkerError = (err: Error): void => {
  console.error('Worker encountered an error');
  console.error(err);
};

const onWorkerExit = (code: number): void => {
  console.log(`Worker exited with code ${code}`);
};

// Spawn workers
export const spawnWorkers = (
  nodeConfigs: NodeConfig[],
  uuidConfigs: string[],
): void => {
  const cpus = os.cpus();
  const totalCpus = cpus.length;

  const numberOfWorkers = Math.min(totalCpus, uuidConfigs.length);

  console.log(`Spawning [${numberOfWorkers}] workers`);

  // TODO: Check this logic!
  // Divide uuids equally among workers
  const chunkSize = Math.ceil(uuidConfigs.length / numberOfWorkers);
  const uuidChunks = Array.from({ length: numberOfWorkers }, (_, i) =>
    uuidConfigs.slice(i * chunkSize, (i + 1) * chunkSize),
  );

  for (let i = 0; i < numberOfWorkers; i++) {
    const workerData: WorkerData = {
      id: i,
      nodeConfigs,
      uuidConfigs: uuidChunks[i] || [], // Default to an empty array
    };

    const worker = new Worker('./dist/worker.js', {
      workerData,
    });

    worker.on('message', onWorkerMessage);
    worker.on('error', onWorkerError);
    worker.on('exit', onWorkerExit);
  }

  const startTime = Date.now();
  const logStats = () => {
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

    setTimeout(logStats, 1000);
  };

  logStats();
};
