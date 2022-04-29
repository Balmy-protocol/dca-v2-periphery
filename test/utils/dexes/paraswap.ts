import { BigNumber } from '@ethersproject/bignumber';
import wallet from '@test-utils/wallet';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { utils } from 'ethers';
import moment from 'moment';
import qs from 'qs';

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

export type SwapParams = {
  srcToken: string;
  srcDecimals: number;
  destToken: string;
  destDecimals: number;
  amount: string; // In weis
  txOrigin: string;
  userAddress: string;
  receiver: string;
  side: 'SELL' | 'BUY';
  network: '1' | '3' | '137' | '56' | '43114';
  otherExchangePrices?: boolean;
  includeDEXS?: string;
  excludeDEXS?: string;
};

export type SwapResponse = {
  from: string;
  to: string;
  allowanceTarget: string;
  value: string;
  data: string;
  gasPrice: string;
  chainId: number;
};

export const swap = async (swapParams: SwapParams): Promise<SwapResponse> => {
  const priceResponse = await axios.get(`https://apiv5.paraswap.io/prices?${qs.stringify(swapParams)}`);
  const transactionQueryParams = {
    // gasPrice: utils.parseUnits('50', 'gwei').toNumber(), Optional
    ignoreChecks: true,
    ignoreGasEstimate: true,
  };
  let transactionsBodyParams: any = {
    srcToken: swapParams.srcToken,
    srcDecimals: swapParams.srcDecimals,
    destToken: swapParams.destToken,
    destDecimals: swapParams.destDecimals,
    priceRoute: priceResponse.data.priceRoute,
    slippage: 0.1 * 100, // 1%
    userAddress: swapParams.userAddress,
    receiver: swapParams.receiver,
    deadline: moment().add('10', 'minutes').unix(),
  };
  if (swapParams.side === 'SELL') {
    transactionsBodyParams.srcAmount = swapParams.amount;
  } else {
    transactionsBodyParams.destAmount = swapParams.amount;
  }
  try {
    const transactionResponse = await axios.post(
      `https://apiv5.paraswap.io/transactions/${swapParams.network}?${qs.stringify(transactionQueryParams)}`,
      transactionsBodyParams
    );
    const finalData = {
      ...transactionResponse.data,
      // Ref.: https://developers.paraswap.network/smart-contracts#tokentransferproxy
      allowanceTarget: (priceResponse.data as any).priceRoute.tokenTransferProxy,
    };
    return finalData;
  } catch (err: any) {
    throw new Error(`Error while fetching transactions params: ${err.response.data.error}`);
  }
};

export default {
  swap,
};
