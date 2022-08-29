FROM node:current-alpine
 
EXPOSE 3000
RUN mkdir -p /app
WORKDIR /app

COPY package.json /app
COPY yarn.lock /app
RUN yarn install

COPY . /app

CMD ["yarn", "start"]
