# Quantum Randomness Lab — developer entry points

.PHONY: bootstrap backend frontend dev prod test test-backend test-frontend test-security smoke-hardware clean

bootstrap:
	bash scripts/bootstrap.sh

backend:
	cd app/backend && python3 -m uvicorn qlab.main:app --host 127.0.0.1 --port 8000 --reload

frontend:
	cd app/frontend && npm run dev

dev: backend frontend

prod:
	cd app/frontend && npm run build
	cd app/backend && python3 -m uvicorn qlab.main:app --host 0.0.0.0 --port 8000

test: test-backend test-frontend test-security

test-backend:
	cd app/backend && python3 -m pytest tests/ -q

test-frontend:
	cd app/frontend && npm test

test-security:
	bash tests/security/scan.sh

smoke-hardware:
	cd app/backend && python3 ../../scripts/hardware_smoke.py --shots 64

clean:
	rm -rf app/frontend/dist app/frontend/node_modules app/backend/.pytest_cache
	find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
