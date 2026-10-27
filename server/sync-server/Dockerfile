# Estágio de compilação
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Instala dependências de cache
COPY go.mod go.sum ./
RUN go mod download

# Copia código fonte
COPY . .

# Compilação binária estática
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o sync-server ./cmd/server

# Estágio final enxuto
FROM alpine:3.20

WORKDIR /app

COPY --from=builder /app/sync-server .

EXPOSE 8080

VOLUME ["/app/data"]

ENV PORT=8080
ENV DATA_DIR=/app/data

CMD ["./sync-server"]
