FROM node:20-alpine

WORKDIR /app

# 의존성 캐싱 — package.json 변경 시에만 npm install 재실행
COPY package.json package-lock.json* ./
RUN npm install

# 소스 코드 (개발 모드에서는 볼륨 마운트로 덮어써짐)
COPY . .

EXPOSE 3000

# Node.js 20의 --watch 플래그로 코드 변경 시 자동 재시작
CMD ["node", "--watch", "src/app.js"]
