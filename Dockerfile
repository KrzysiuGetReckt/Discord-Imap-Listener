# Używamy oficjalnego Node.js LTS
FROM node:20-alpine

# Instalacja bash, cron i tzdata
RUN apk add --no-cache bash curl tzdata

# Ustaw katalog roboczy
WORKDIR /app

# Kopiujemy pliki pakietu
COPY package*.json ./

# Instalacja zależności
RUN npm install --production

# Kopiujemy resztę aplikacji
COPY . .

# Tworzymy folder dla crona
RUN mkdir -p /etc/cron.d

# Dodajemy skrypt czyszczenia logów
COPY backup-scripts/backup_logs.sh /usr/local/bin/backup_logs.sh
RUN chmod +x /usr/local/bin/backup_logs.sh

# Dodanie crona
COPY backup-scripts/cron-jobs /etc/cron.d/discord-cron
RUN chmod 0644 /etc/cron.d/discord-cron && \
    crontab /etc/cron.d/discord-cron

# Wolumeny
VOLUME ["/app/logs", "/app/uidDatabase"]

# Uruchomienie crona i aplikacji
CMD ["sh", "-c", "crond -f -L /var/log/cron.log & node index.js"]