# Railway 의 기본 빌더(Railpack)가 빌드 단계와 실행 단계에 서로 다른 이미지를 써서
# better-sqlite3 네이티브 바이너리가 빌드 때와 실행 때 서로 안 맞아 세그폴트가 났다
# (build/deploy 로그 모두 성공, 실행만 "Segmentation fault" — 전형적인 glibc/Node
# ABI 불일치 증상). 빌드와 실행을 완전히 같은 이미지로 고정해서 이 문제를 원천 차단한다.
FROM node:20-bookworm-slim

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
