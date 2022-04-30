import { deployments, network } from 'hardhat';
import { run } from 'hardhat';

async function main() {
  const currentNetwork = network.name;

  await verify({
    name: 'DCAHubCompanion',
    path: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
  });

  await verify({
    name: 'DCAHubSwapper',
    path: 'contracts/DCAHubSwapper/DCAHubSwapper.sol:DCAHubSwapper',
  });

  if (currentNetwork === 'optimism' || currentNetwork === 'optimism-kovan' || currentNetwork === 'polygon' || currentNetwork === 'mumbai') {
    await verify({
      name: 'PositionMigrator',
      path: 'contracts/V2Migration/PositionMigrator.sol:PositionMigrator',
    });
  }

  if (currentNetwork === 'mainnet') {
    await verify({
      name: 'DCAKeep3rJob',
      path: 'contracts/DCAKeep3rJob/DCAKeep3rJob.sol:DCAKeep3rJob',
    });
  }
}

async function verify({ name, path }: { name: string; path: string }) {
  const contract = await deployments.getOrNull(name);
  try {
    await run('verify:verify', {
      address: contract!.address,
      constructorArguments: contract!.args,
      contract: path,
    });
  } catch (e: any) {
    console.log(name, 'already verified');
    if (!e.message.toLowerCase().includes('already verified')) {
      throw e;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
