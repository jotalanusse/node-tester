import { Worker, workerData } from 'worker_threads';
import os from 'os';
import { Node } from './class/node';
import { Account } from './class/account';
import { WorkerData } from './interfaces/worker-data.interface';

const onWorkerMessage = (message: string): void => {};
const onWorkerError = (err: Error): void => {};
const onWorkerExit = (code: number): void => {};

export const spawnWorkers = (nodes: Node[], accounts: Account[]): void => {
  const cpus = os.cpus();
  const totalCpus = cpus.length;

  console.log(`Total CPUs [${totalCpus}]`);

  for (let i = 0; i <= totalCpus; i++) {
    const workerData: WorkerData = {
      id: i,
      nodes,
      accounts,
    };

    const worker = new Worker('./dist/worker.js', {
      workerData,
    });

    worker.on('message', onWorkerMessage);
    worker.on('error', onWorkerError);
    worker.on('exit', onWorkerExit);
  }
};
