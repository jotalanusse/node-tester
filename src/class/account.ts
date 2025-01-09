import { Klyra, LocalWallet, WalletSubaccountInfo } from '@klyra/core';

const BECH32_PREFIX = 'klyra';

const toBigInt = (u: Uint8Array): bigint => {
  if (u.length <= 1) {
    return BigInt(0);
  }

  // eslint-disable-next-line no-bitwise -- bitwise operations are needed here
  const negated: boolean = (u[0]! & 1) === 1;
  const hex: string = Array.from(u.slice(1))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const abs = BigInt(`0x${hex}`);
  return negated ? -abs : abs;
};

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
  lastBlockTransfered: number;
  lastBlockTransacted: number;

  constructor(name: string, address: string, wallet: LocalWallet) {
    this.name = name;
    this.address = address;
    this.wallet = wallet;
    this.tDaiBalance = new Balance(0);
    this.lastBlockTransfered = 0;
    this.lastBlockTransacted = 0;
  }

  async updateTDaiBalanceFromNode(klyraClient: Klyra) {
    // const coin = await klyraClient
    //   .getChainClient()
    //   .nodeClient.get.getAccountBalance(this.address, 'utdai');
    // this.tDaiBalance.setAmount(parseInt(coin!.amount));

    const subaccount = await klyraClient
      .getChainClient()
      .nodeClient.get.getSubaccount(this.address, 0);

    const balance = subaccount.subaccount.assetPositions[0]!.quantums;

    const bigintBalance = toBigInt(balance);
    const normalizedBalance = Number(bigintBalance) / 10 ** 6;
    const roundedBalance = Math.round(normalizedBalance); // TODO: Do we need precision beyond 1 tDai?

    this.tDaiBalance.setAmount(roundedBalance);
  }

  async transferTDai(klyraClient: Klyra, address: string, amount: string) {
    const subaccount = new WalletSubaccountInfo(this.wallet, 0);

    const transaction = await klyraClient.transfer(
      subaccount,
      address,
      0,
      amount,
    );

    console.log(
      `Transfer of [${amount}] from [${this.name}] to address [${this.address}] with hash [${transaction.hash}]`,
    );

    return transaction;
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
