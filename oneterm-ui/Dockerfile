FROM node:22-alpine AS builder
WORKDIR /oneterm-ui
COPY package.json ./
RUN yarn config set registry https://registry.npmmirror.com/
RUN yarn install --non-interactive
COPY . .
# Vue CLI 4 uses Webpack 4, which needs the legacy provider on Node 22.
RUN NODE_OPTIONS=--openssl-legacy-provider yarn build

FROM nginx:alpine
COPY --from=builder /oneterm-ui/dist /etc/nginx/html
RUN rm /etc/nginx/conf.d/default.conf