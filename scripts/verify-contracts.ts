import { deployments } from 'hardhat';
import { run } from 'hardhat';

async function main() {
  await verify({
    name: 'DCAHubCompanion',
    path: 'contracts/DCAHubCompanion/DCAHubCompanion.sol:DCAHubCompanion',
  });
}

async function verify({ name, path }: { name: string; path: string }) {
  const title = `Verified ${name} ...`;
  console.time(title);
  const contract = await deployments.getOrNull(name);
  await run('verify:verify', {
    address: contract!.address,
    constructorArguments: contract!.args,
    contract: path,
  });
  console.timeEnd(title);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });