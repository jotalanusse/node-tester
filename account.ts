import { Klyra, LocalWallet } from '@klyra/core';

const BECH32_PREFIX = 'klyra';

class Balance {
  amount: number;

  constructor(amount: number) {
    this.amount = amount;
  }

  setAmount(amount: number) {
    this.amount = amount;
  }

  addAmount(amount: number) {
    this.amount = this.amount + amount;
  }

  subtractAmount(amount: number) {
    this.amount = this.amount - amount;
  }
}

export class Account {
  readonly name: string;
  readonly address: string;
  readonly wallet: LocalWallet;
  readonly tDaiBalance: Balance;

  constructor(name: string, address: string, wallet: LocalWallet) {
    this.name = name;
    this.address = address;
    this.wallet = wallet;
    this.tDaiBalance = new Balance(0);
  }

  async updateTDaiBalanceFromNode(klyraClient: Klyra) {
    const coin = await klyraClient
      .getChainClient()
      .nodeClient.get.getAccountBalance(this.address, 'utdai');
    this.tDaiBalance.setAmount(parseInt(coin!.amount));

    // const test = await klyraClient.getChainClient().nodeClient.get.getAccountBalances(this.address);
    // console.log(test);
  }

  static async fromUUID(klyraClient: Klyra, uuid: string): Promise<Account> {
    const { wallet, address } = await klyraClient.getSubaccountFromUUID(uuid);

    return new Account(uuid, address, wallet);
  }

  static async fromMnemonic(name: string, mnemonic: string): Promise<Account> {
    const wallet = await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
    const address = wallet.getAddress();

    return new Account(name, address, wallet);
  }
}
