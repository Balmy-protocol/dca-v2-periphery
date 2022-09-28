import { subtask } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_COMPILE_JOBS } from 'hardhat/builtin-tasks/task-names';
import fs from 'fs/promises';

subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS, 'Clean mocks from types if needed').setAction(async (taskArgs, { run }, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);
  if (!!process.env.PUBLISHING_NPM) {
    console.log('🫠 Removing all mock references from typechain');
    // Cleaning typechained/index
    console.log(`  🧹 Excluding from main index`);
    let typechainIndexBuffer = await fs.readFile('./typechained/index.ts');
    let finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('Mock') && !line.includes('mock'))
      .join('\n');
    await fs.writeFile('./typechained/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/contracts/index
    console.log(`  🧹 Excluding from contracts index`);
    typechainIndexBuffer = await fs.readFile('./typechained/contracts/index.ts');
    finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('Mock') && !line.includes('mock'))
      .join('\n');
    await fs.writeFile('./typechained/contracts/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/factories/contracts/index
    console.log(`  🧹 Excluding from factories contract's index`);
    typechainIndexBuffer = await fs.readFile('./typechained/factories/contracts/index.ts');
    finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('Mock') && !line.includes('mock'))
      .join('\n');
    await fs.writeFile('./typechained/factories/contracts/index.ts', finalTypechainIndex, 'utf-8');
  }
  return compileSolOutput;
});
