# Accessible Seerr — static frontend container
#
# This image serves only static files (HTML, CSS, JavaScript) via Nginx.
# It contains no build tools, no runtime language, and no credentials.
# The same image works on any domain because the frontend uses relative
# asset paths and root-relative same-origin API calls only.

FROM nginx:alpine

# Remove the default Nginx welcome page and config.
RUN rm -rf /usr/share/nginx/html/* \
    && rm -f /etc/nginx/conf.d/default.conf

# Container-level Nginx configuration (no public hostname, no TLS).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static site files.
COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
