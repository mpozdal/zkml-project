import { defineConfig } from 'hardhat/config';

import hardhatIgnitionPlugin from '@nomicfoundation/hardhat-ignition';
import hardhatIgnitionViemPlugin from '@nomicfoundation/hardhat-ignition-viem';
import hardhatVerifyPlugin from '@nomicfoundation/hardhat-verify';
import hardhatViemPlugin from '@nomicfoundation/hardhat-viem';

import 'dotenv/config';

export default defineConfig({
	plugins: [
		hardhatIgnitionPlugin,
		hardhatIgnitionViemPlugin,
		hardhatVerifyPlugin,
		hardhatViemPlugin,
	],
	solidity: {
		version: '0.8.29',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		sepolia: {
			type: 'http',
			url: process.env.SEPOLIA_URL,
			accounts: [process.env.PRIVATE_KEY],
		},
	},
});
