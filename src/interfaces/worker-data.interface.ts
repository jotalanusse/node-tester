import { Account } from '../class/account';
import { Node } from '../class/node';

export interface WorkerData {
  id: number;
  nodes: Node[];
  accounts: Account[];
}
