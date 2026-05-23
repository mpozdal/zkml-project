import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('CreditZKMLModule', (m) => {
	const verifier = m.contract('Groth16Verifier');

	const creditRegistry = m.contract('CreditRegistry', [verifier]);

	return { verifier, creditRegistry };
});
