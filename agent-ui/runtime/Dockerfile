FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./

RUN npm install --only=production

COPY . .

EXPOSE 3001

ENV WS_PORT=3001

CMD ["node", "websocket.js"]

