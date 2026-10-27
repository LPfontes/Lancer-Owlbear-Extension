package config

import (
	"os"
	"time"
)

// Config armazena os parâmetros operacionais do servidor de sincronização.
type Config struct {
	Port           string
	DataDir        string
	PingPeriod     time.Duration
	PongWait       time.Duration
	WriteWait      time.Duration
	MaxMessageSize int64
	DebounceDelay  time.Duration
}

// LoadConfig carrega as configurações das variáveis de ambiente com padrões seguros.
func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	return &Config{
		Port:           port,
		DataDir:        dataDir,
		WriteWait:      10 * time.Second,
		PongWait:       60 * time.Second,
		PingPeriod:     50 * time.Second, // Deve ser menor que PongWait
		MaxMessageSize: 512 * 1024,       // 512 KB
		DebounceDelay:  3 * time.Second,
	}
}
