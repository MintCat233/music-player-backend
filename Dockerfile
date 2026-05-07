FROM node:20-alpine

RUN apk add --no-cache tini

ENV NODE_ENV production
ENV HUSKY 0

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts

COPY . ./

RUN chown -R node:node /app

USER node

EXPOSE 3000
EXPOSE 4000

CMD [ "/sbin/tini", "--", "node", "app.js" ]
