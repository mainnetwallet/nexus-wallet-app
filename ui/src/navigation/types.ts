export type TransferToolId =
  | 'batchNative'
  | 'batchToken'
  | 'multiKey'
  | 'walletToWallet'
  | 'self'
  | 'nft'
  | 'approvals'
  | 'withdraw'
  | 'balanceCheck'
  | 'phraseTools';

export type MainTabParamList = {
  Home: undefined;
  Swap: undefined;
  Bridge: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  Send: { chainId?: number } | undefined;
  Receive: undefined;
  History: undefined;
  TokenManager: undefined;
  TokenChart: { symbol?: string; chainId?: number } | undefined;
  TransferHub: undefined;
  TransferTool: { tool: TransferToolId };
  SupTransfer: undefined;
  BaseSwapBot: undefined;
  Nansen: undefined;
  Delegation: undefined;
  Browser: { url?: string } | undefined;
  Exchange: undefined;
  Futures: undefined;
  ExchangeKeys: undefined;
  Deposit: undefined;
  ExchangeWithdraw: undefined;
  RpcManager: undefined;
  ConsoleLog: undefined;
  AddressList: undefined;
  LockSetup: undefined;
  PairManager: undefined;
  Migration: undefined;
};
