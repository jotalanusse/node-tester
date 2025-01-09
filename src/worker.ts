import { parentPort, workerData } from 'worker_threads';

const reportStatus = (): void => {
  parentPort?.postMessage(`Worker with ID ${workerData} is running`);
};

reportStatus();
