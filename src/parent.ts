import os from 'os';
import { Worker } from 'worker_threads';
import { WorkerData } from './interfaces/worker-data.interface';
import { NodeConfig } from './interfaces/node-config.interface';
import { formatTime } from './utils/utils';
import { LogMessage, MessageType, MessageWrapper } from './messages/messages';

const onWorkerMessage = (messageWrapper: MessageWrapper): void => {
  if (messageWrapper.type === MessageType.Log) {
    const logMessage = messageWrapper.message as LogMessage;

    const formattedMessage = `[${formatTime(
      new Date().getSeconds(),
    )}] [Worker ${messageWrapper.workerId}]: ${logMessage.message}`;

    console.log(formattedMessage);
  }
};
const onWorkerError = (err: Error): void => {
  console.error('Worker encountered an error');
  console.error(err);
};
const onWorkerExit = (code: number): void => {
  console.log(`Worker exited with code ${code}`);
}

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
};
