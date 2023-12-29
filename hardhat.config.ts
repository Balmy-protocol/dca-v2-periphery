import 'dotenv/config';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import '@typechain/hardhat/dist/type-extensions';
import { removeConsoleLog } from 'hardhat-preprocessor';
import 'hardhat-gas-reporter';
import 'hardhat-contract-sizer';
import '@0xged/hardhat-deploy';
import 'solidity-coverage';
import 'hardhat-dependency-compiler';
import './tasks/npm-publish-clean-typechain';
import { HardhatUserConfig, MultiSolcUserConfig, NetworksUserConfig } from 'hardhat/types';
import { getNodeUrl, accounts } from './utils/network';
import 'tsconfig-paths/register';

const networks: NetworksUserConfig = process.env.TEST
  ? {
      hardhat: {
        allowUnlimitedContractSize: true,
      },
    }
  : {
      hardhat: {
        forking: {
          enabled: process.env.FORK ? true : false,
          url: getNodeUrl('mainnet'),
        },
        tags: ['test', 'local'],
      },
      localhost: {
        url: getNodeUrl('localhost'),
        live: false,
        accounts: accounts('localhost'),
        tags: ['local'],
      },
      rinkeby: {
        url: getNodeUrl('rinkeby'),
        accounts: accounts('rinkeby'),
        tags: ['staging'],
      },
      ropsten: {
        url: getNodeUrl('ropsten'),
        accounts: accounts('ropsten'),
        tags: ['staging'],
      },
      kovan: {
        url: getNodeUrl('kovan'),
        accounts: accounts('kovan'),
        tags: ['staging'],
      },
      goerli: {
        url: getNodeUrl('goerli'),
        accounts: accounts('goerli'),
        tags: ['staging'],
      },
      ethereum: {
        url: getNodeUrl('ethereum'),
        accounts: accounts('ethereum'),
        tags: ['production'],
      },
      'optimism-kovan': {
        url: 'https://kovan.optimism.io',
        accounts: accounts('optimism-kovan'),
        tags: ['staging'],
      },
      optimism: {
        url: 'https://mainnet.optimism.io',
        accounts: accounts('optimism'),
        tags: ['production'],
      },
      arbitrum: {
        url: getNodeUrl('arbitrum'),
        accounts: accounts('arbitrum'),
        tags: ['production'],
      },
      mumbai: {
        url: getNodeUrl('mumbai'),
        accounts: accounts('mumbai'),
        tags: ['staging'],
      },
      polygon: {
        url: 'https://polygon-rpc.com',
        accounts: accounts('polygon'),
        tags: ['production'],
      },
      rootstock: {
        url: getNodeUrl('rootstock'),
        accounts: accounts('rootstock'),
        tags: ['production'],
      },
    };

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  mocha: {
    timeout: process.env.MOCHA_TIMEOUT || 300000,
  },
  namedAccounts: {
    deployer: {
      default: 4,
    },
    eoaAdmin: '0x1a00e1E311009E56e3b0B9Ed6F86f5Ce128a1C01',
    msig: {
      ethereum: '0xEC864BE26084ba3bbF3cAAcF8F6961A9263319C4',
      optimism: '0x308810881807189cAe91950888b2cB73A1CC5920',
      polygon: '0xCe9F6991b48970d6c9Ef99Fffb112359584488e3',
      arbitrum: '0x84F4836e8022765Af9FBCE3Bb2887fD826c668f1',
      rootstock: '0x26d249089b2849bb0643405a9003f35824fa1f24',
    },
  },
  networks,
  solidity: {
    compilers: [
      {
        version: '0.8.16',
        settings: {
          optimizer: {
            enabled: true,
            runs: 9999,
          },
        },
      },
    ],
    // CONFIG ONLY USED FOR ROOTSTOCK
    // overrides: {
    //   'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion': {
    //     version: '0.8.16',
    //     settings: {
    //       viaIR: true,
    //       optimizer: {
    //         enabled: true,
    //         runs: 9999,
    //       },
    //     },
    //   },
    // },
  },
  etherscan: {
    apiKey: {
      rootstock: 'PLACEHOLDER_STRING',
    },
    customChains: [
      {
        network: 'rootstock',
        chainId: 30,
        urls: {
          apiURL: 'https://rootstock.blockscout.com/api',
          browserURL: 'https://rootstock.blockscout.com',
        },
      },
    ],
  },
  gasReporter: {
    currency: process.env.COINMARKETCAP_DEFAULT_CURRENCY || 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: true,
    outputFile: 'gasReporterOutput.json',
    noColors: true,
  },
  preprocess: {
    eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat'),
  },
  external: {
    deployments: {
      mainnet: [
        'node_modules/@mean-finance/dca-v2-core/deployments/mainnet',
        'node_modules/@mean-finance/chainlink-registry/deployments/mainnet',
      ],
      mumbai: ['node_modules/@mean-finance/dca-v2-core/deployments/mumbai', 'node_modules/@mean-finance/chainlink-registry/deployments/mumbai'],
      optimism: [
        'node_modules/@mean-finance/dca-v2-core/deployments/optimism',
        'node_modules/@mean-finance/chainlink-registry/deployments/optimism',
      ],
      'optimism-kovan': [
        'node_modules/@mean-finance/dca-v2-core/deployments/optimism-kovan',
        'node_modules/@mean-finance/chainlink-registry/deployments/optimismkovan',
      ],
      arbitrum: [
        'node_modules/@mean-finance/dca-v2-core/deployments/arbitrum',
        'node_modules/@mean-finance/chainlink-registry/deployments/arbitrum',
      ],
      polygon: [
        'node_modules/@mean-finance/dca-v2-core/deployments/polygon',
        'node_modules/@mean-finance/chainlink-registry/deployments/polygon',
      ],
    },
  },
  typechain: {
    outDir: 'typechained',
    target: 'ethers-v5',
  },
};

if (process.env.TEST) {
  config.external!.contracts = [
    {
      artifacts: 'node_modules/@mean-finance/nft-descriptors/artifacts',
      deploy: 'node_modules/@mean-finance/nft-descriptors/deploy',
    },
    {
      artifacts: 'node_modules/@mean-finance/transformers/artifacts',
      deploy: 'node_modules/@mean-finance/transformers/deploy',
    },

    {
      artifacts: 'node_modules/@mean-finance/chainlink-registry/artifacts',
      deploy: 'node_modules/@mean-finance/chainlink-registry/deploy',
    },
    {
      artifacts: 'node_modules/@mean-finance/oracles/artifacts',
      deploy: 'node_modules/@mean-finance/oracles/deploy',
    },
    {
      artifacts: 'node_modules/@mean-finance/dca-v2-core/artifacts',
      deploy: 'node_modules/@mean-finance/dca-v2-core/deploy',
    },
    {
      artifacts: 'node_modules/@mean-finance/swappers/artifacts',
      deploy: 'node_modules/@mean-finance/swappers/deploy',
    },
  ];
  const solidity = config.solidity as MultiSolcUserConfig;
  solidity.compilers.forEach((_, i) => {
    solidity.compilers[i].settings! = {
      ...solidity.compilers[i].settings!,
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    };
  });
  config.solidity = solidity;
}

export default config;
