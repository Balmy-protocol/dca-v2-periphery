import { deployments, network } from 'hardhat';
import { run } from 'hardhat';

async function main() {
  const currentNetwork = network.name;

  await verify({
    name: 'DCAHubCompanion',
    path: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
  });

  if (currentNetwork === 'optimism-kovan' || currentNetwork === 'optimism') {
    await verify({
      name: 'BetaMigrator',
      path: 'contracts/V2Migration/BetaMigrator.sol:BetaMigrator',
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
