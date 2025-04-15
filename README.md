# DCA V2 - Periphery

[![Lint](https://github.com/Balmy-protocol/dca-v2-periphery/actions/workflows/lint.yml/badge.svg)](https://github.com/Balmy-protocol/dca-v2-periphery/actions/workflows/lint.yml)
[![Tests (unit, integration)](https://github.com/Balmy-protocol/dca-v2-periphery/actions/workflows/tests.yml/badge.svg)](https://github.com/Balmy-protocol/dca-v2-periphery/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/@balmy/dca-v2-periphery/latest.svg)](https://www.npmjs.com/package/@balmy/dca-v2-periphery/v/latest)

This repository contains the periphery smart contracts for the DCA V2 Protocol.

## 💰 Bug bounty

This repository is subject to the DCA V2 bug bounty program, per the terms defined [here](./BUG_BOUNTY.md).

## 📖 Docs

Check our docs at [docs.balmy.xyz](https://docs.balmy.xyz)

## 📦 NPM/YARN Package

- NPM Installation

```bash
npm install @balmy/dca-v2-periphery
```

- Yarn installation

```bash
yarn add @balmy/dca-v2-periphery
```

## 👨‍💻 Development environment

- Copy environment file

```bash
cp .env.example .env
```

- Fill environment file with your information

```bash
nano .env
```

## 🧪 Testing

### Unit

```bash
yarn test:unit
```

Will run all tests under [test/unit](./test/unit)

### Integration

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn test:integration
```

Will run all tests under [test/integration](./test/integration)

## 🚢 Deployment

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn deploy --network [network]
```

The plugin `hardhat-deploy` is used to deploy contracts.

## Licensing

The primary license for DCA V2 Periphery is the GNU General Public License v2.0 (`GPL-2.0-or-later`), see [`LICENSE`](./LICENSE).

### Exceptions

- All files in `contracts/mocks` remain unlicensed.
