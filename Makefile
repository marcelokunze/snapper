anvil:
	anvil -p 8545

deploy-local:
	cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -vvv

backend:
	cd backend && pnpm dev

dev:
	pnpm dev


