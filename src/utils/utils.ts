import { Account, Klyra } from '@klyra/core';
import { Node } from '../class/node';
import { NodeConfig } from 'src/interfaces/node-config.interface';

export const randomIntFromInterval = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

export const getRandomNode = (nodes: Node[]): Node | undefined => {
  const index = Math.floor(Math.random() * nodes.length);
  return nodes[index];
};

export const getRandomAccount = (accounts: Account[]): Account => {
  const index = Math.floor(Math.random() * accounts.length);
  return accounts[index]!;
};

export const formatTime = (seconds: number) => {
  const pad = (num: number) => (num < 10 ? `0${num}` : num);

  const H = pad(Math.floor(seconds / 3600));
  const i = pad(Math.floor((seconds % 3600) / 60));
  const s = pad(Math.floor(seconds % 60));

  return `${H}:${i}:${s}`;
};

export const formatNumber = (num: number): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    return num.toString();
  }
};

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createKlyraClient = (nodeConfig: NodeConfig): Klyra => {
  const klyraClientOptions = {
    environment: {
      chainId: 'klyra-testnet',
      node: {
        rpc: `http://${nodeConfig.ip}:${nodeConfig.port}`,
      },
      indexer: {
        rest: 'https://demo-api.klyra.com',
        ws: 'wss://demo-api.klyra.com/v4/ws',
        // rest: 'https://test.com',
        // ws: 'wss://test.com/v4/ws',
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

  const klyraClient = new Klyra(klyraClientOptions);

  return klyraClient;
};
