import { NodeConfig } from './node-config.interface';

export interface WorkerData {
  id: number;
  nodeConfigs: NodeConfig[];
  uuidConfigs: string[];
}
