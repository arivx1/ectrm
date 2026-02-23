.PHONY: dev db-up db-down

db-up:
	docker compose up -d

db-down:
	docker compose down

dev:
	docker compose up -d
