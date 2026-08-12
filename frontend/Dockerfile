# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
# Render passes service env vars matching ARG names at build time
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/start-nginx.sh /start-nginx.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /start-nginx.sh
EXPOSE 80
CMD ["/start-nginx.sh"]
