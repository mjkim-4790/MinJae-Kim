# Railway 의 기본 빌더(Railpack)로도, 빌드/실행을 같은 이미지로 고정한 일반
# Dockerfile로도 better-sqlite3 가 "Segmentation fault"로 죽었다 — 빌드/실행 이미지가
# 같아도 재현되는 걸 보면 원인은 이미지 불일치가 아니라 아키텍처 불일치였다. Railway
# 빌드 인프라가 이미지를 만드는 아키텍처와 실제 배포 컨테이너가 도는 아키텍처가
# 다르면(ARM ↔ AMD64) 네이티브 바이너리가 정확히 이렇게 죽는다. --platform 을 명시해
# 항상 amd64 로 빌드/실행되도록 고정한다.
FROM --platform=linux/amd64 node:20-bookworm-slim

# better-sqlite3 가 이 정확한 이미지에 맞는 미리 빌드된 바이너리를 못 찾으면
# 여기서 직접 컴파일한다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
