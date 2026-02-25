FROM prom/prometheus:latest
WORKDIR /etc/prometheus

COPY prometheus.yml /etc/prometheus/prometheus.yml
RUN mkdir -p /prometheus

EXPOSE 9090

CMD [
  "--config.file=/etc/prometheus/prometheus.yml",
  "--storage.tsdb.path=/prometheus",
  "--storage.tsdb.retention.time=7d"
]
