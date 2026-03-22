.PHONY: install install-backend install-frontend dev serve index build

install: install-backend install-frontend

install-backend:
	cd backend && pip install -e .

install-frontend:
	cd frontend && npm install

dev:
	cd frontend && npm run dev

serve:
	photocull serve --db ./photocull.db --thumbs ./thumbs/ --port 8899

index:
	photocull index --source /Volumes/photos --db ./photocull.db --thumbs ./thumbs/

build:
	cd frontend && npm run build
