help:
	@echo "Usage: make <target>"
	@echo "  migrations                       Run database migrations"



migrations:
	npx prisma migrate dev && npx prisma generate