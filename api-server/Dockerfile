FROM oven/bun:1-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 9000

CMD ["bun", "run", "src/index.ts"]
