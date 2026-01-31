FROM httpd:2.4

# Copy custom httpd.conf into container
COPY ./httpd.conf /usr/local/apache2/conf/httpd.conf

# Ensure /tmp is writable for logs
RUN mkdir -p /tmp && chmod 777 /tmp

# Expose port 8080 (matches VirtualHost)
EXPOSE 8080

# Start Apache in foreground
CMD ["httpd", "-D", "FOREGROUND"]
