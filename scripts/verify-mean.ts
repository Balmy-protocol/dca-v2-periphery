import hre, { deployments } from 'hardhat';
import { run } from 'hardhat';

const DEFAULT = {
  compilerVersion: '0.8.16',
  runs: 9999,
  viaIR: false,
};

type Contract = {
  path: string;
  compilerVersion?: string;
  runs?: number;
  viaIR?: boolean;
  avoidVerificationOn?: string[];
  onlyVerificationOn?: string[];
};

const CONTRACTS: Record<string, Contract> = {
  // DCA Periphery
  DCAFeeManager: {
    path: 'contracts/DCAFeeManager/DCAFeeManager.sol:DCAFeeManager',
  },
  DCAHubCompanion: {
    path: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
    viaIR: true,
  },
  CallerOnlyDCAHubSwapper: {
    path: 'contracts/DCAHubSwapper/CallerOnlyDCAHubSwapper.sol:CallerOnlyDCAHubSwapper',
  },
  ThirdPartyDCAHubSwapper: {
    path: 'contracts/DCAHubSwapper/ThirdPartyDCAHubSwapper.sol:ThirdPartyDCAHubSwapper',
  },
};

async function main() {
  // Make sure config matches deployments
  assertConfigMatchesDeployments();

  // Set sources as dependencies
  setSourcesAsDependencies();

  // Set compile config
  setCompilerConfig();

  // Compile dependencies
  await run('compile');

  // Verify contracts
  const network = hre.deployments.getNetworkName();
  const allDeployments = await deployments.all();
  const failedVerifications: { name: string; error: string }[] = [];
  for (const name in allDeployments) {
    const contract = CONTRACTS[name];
    const abort =
      (contract.onlyVerificationOn && !contract.onlyVerificationOn.includes(network)) ||
      (contract.avoidVerificationOn && contract.avoidVerificationOn.includes(network));
    if (abort) continue;
    try {
      await verify({ name });
    } catch (e: any) {
      failedVerifications.push({ name, error: e.message });
    }
  }
  if (failedVerifications.length > 0) console.log('Failed verifications:', failedVerifications.map((fv) => fv.name).join(', '));
}

async function assertConfigMatchesDeployments() {
  const allContractsInConfig = new Set(Object.keys(CONTRACTS));

  const notInConfig = Object.keys(await deployments.all()).filter((deployment) => !allContractsInConfig.has(deployment));

  if (notInConfig.length > 0) {
    console.log('Contracts not in config:');
    console.log([...notInConfig].sort());
    throw new Error('Please make sure that all contracts deployed are configured so that they can be verified');
  }
}

function calculateFilePath(path: string) {
  return path.substring(0, path.lastIndexOf(':'));
}

function setSourcesAsDependencies() {
  // const filePaths = Object.values(CONTRACTS).map(({ path }) => calculateFilePath(path))
  // hre.config.dependencyCompiler = {
  //   paths: filePaths,
  //   path: './hardhat-dependency-compiler',
  //   keep: false
  // }
}

function setCompilerConfig() {
  hre.config.solidity.overrides = {};
  for (const name in CONTRACTS) {
    const config = CONTRACTS[name];
    const path = calculateFilePath(config.path);
    hre.config.solidity.overrides[path] = {
      version: config.compilerVersion ?? DEFAULT.compilerVersion,
      settings: {
        viaIR: config.viaIR ?? DEFAULT.viaIR,
        optimizer: {
          enabled: true,
          runs: config.runs ?? DEFAULT.runs,
        },
        // Have no idea why this is needed, hardhat adds it and if we don't, it won't work
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'metadata'],
            '': ['ast'],
          },
        },
      },
    };
  }
}

async function verify({ name }: { name: string }) {
  const contract = await deployments.getOrNull(name);
  try {
    await run('verify:verify', {
      address: contract!.address,
      constructorArguments: contract!.args,
      contract: CONTRACTS[name].path,
    });
  } catch (e: any) {
    if (e.message.toLowerCase().includes('already verified')) {
      console.log(name, 'already verified at', contract?.address);
    } else {
      throw e;
    }
  }
  console.log('---------------');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
