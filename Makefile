.PHONY: setup dev

setup:
	node scripts/setup.mjs

dev:
	node node_modules/next/dist/bin/next dev --port 3000
