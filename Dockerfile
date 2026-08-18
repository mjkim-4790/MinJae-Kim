# better-sqlite3@13 은 engines 에 node >= 22 를 요구한다. Railway 기본 빌더는 Node 20 을
#골랐고, 그 상태로는 네이티브 모듈이 로드되는 순간 "Segmentation fault"(exit 139)로
# 죽는다 — 로컬(Node 24)에서는 멀쩡하니 배포에서만 재현됐다. 실행 Node 버전을 여기서
# 명시적으로 고정해 이 불일치를 원천 차단한다 (로컬 개발 버전과도 맞춘다).
FROM node:24-bookworm-slim

# better-sqlite3 가 이 이미지에 맞는 미리 빌드된 바이너리를 못 찾으면 여기서 직접 컴파일한다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --include=dev

# 네이티브 모듈이 이 이미지에서 실제로 로드되는지 빌드 시점에 확인한다. 실패하면 배포된
# 뒤 헬스체크가 애매하게 죽는 대신 빌드가 즉시, 명확한 이유로 멈춘다.
RUN node -e "const D=require('better-sqlite3'); new D(':memory:').prepare('select 1').get(); console.log('better-sqlite3 OK on', process.version)"

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
