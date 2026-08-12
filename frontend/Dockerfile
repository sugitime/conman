# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN echo "Building with VITE_API_URL=${VITE_API_URL}" && npm run build

FROM nginx:1.27-alpine
# SPA-only config for Render (API is a separate service)
COPY nginx.render.conf /etc/nginx/conf.d/default.conf
COPY docker/start-nginx.sh /start-nginx.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /start-nginx.sh && sed -i 's/\r$//' /start-nginx.sh
EXPOSE 80
CMD ["/start-nginx.sh"]
