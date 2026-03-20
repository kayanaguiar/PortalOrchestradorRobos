FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM nginx:alpine

# Rate limiting zone (shared between configs)
RUN echo 'limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;' > /etc/nginx/conf.d/rate_limit.conf

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx-http.conf
COPY nginx-ssl.conf /etc/nginx/nginx-ssl.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-entrypoint.sh /nginx-entrypoint.sh
RUN chmod +x /nginx-entrypoint.sh

EXPOSE 80 443

CMD ["/nginx-entrypoint.sh"]
