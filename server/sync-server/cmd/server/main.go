package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"compcon-sync-server/internal/config"
	"compcon-sync-server/internal/hub"
	"compcon-sync-server/internal/models"
	"compcon-sync-server/internal/storage"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Permite conexões de qualquer origem, necessário para iframes do Owlbear Rodeo
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	cfg := config.LoadConfig()
	dbPath := filepath.Join(cfg.DataDir, "compcon_sync.db")
	dbStore, err := storage.NewSQLiteStore(dbPath)
	if err != nil {
		log.Fatalf("Falha crítica ao inicializar banco SQLite: %v", err)
	}
	defer dbStore.Close()

	roomMgr := hub.NewRoomManager(cfg)
	roomMgr.SetStorageHooks(dbStore.SaveRoomState, dbStore.LoadRoomState)

	mux := http.NewServeMux()

	// Endpoint de verificação de integridade
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "ok",
			"rooms":  roomMgr.RoomCount(),
			"time":   time.Now().UnixMilli(),
		})
	})

	// Endpoint HTTP para encerrar encontro e limpar iniciativa
	mux.HandleFunc("/api/rooms/end-encounter", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Método não permitido (use POST)", http.StatusMethodNotAllowed)
			return
		}

		roomID := r.URL.Query().Get("roomId")
		var encounterID string
		var reason string

		if r.Body != nil {
			var body struct {
				RoomID      string `json:"roomId"`
				EncounterID string `json:"encounterId"`
				Reason      string `json:"reason"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
				if body.RoomID != "" {
					roomID = body.RoomID
				}
				encounterID = body.EncounterID
				reason = body.Reason
			}
		}

		if roomID == "" {
			http.Error(w, "Parâmetro 'roomId' é obrigatório no query param ou body JSON", http.StatusBadRequest)
			return
		}

		room := roomMgr.GetOrCreateRoom(roomID)
		senderID := "http_api"
		if reason != "" {
			senderID = "http_api:" + reason
		}

		var payload *models.EndEncounterPayload
		if encounterID != "" || reason != "" {
			payload = &models.EndEncounterPayload{
				EncounterID: encounterID,
				Reason:      reason,
			}
		}

		room.EndEncounterAndBroadcast(senderID, payload)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"roomId":  roomID,
			"message": "Encontro encerrado e lista de iniciativa limpa com sucesso",
		})
	})

	// Endpoint WebSocket
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		roomID := q.Get("roomId")
		if roomID == "" {
			http.Error(w, "Parâmetro 'roomId' é obrigatório", http.StatusBadRequest)
			return
		}

		playerID := q.Get("playerId")
		if playerID == "" {
			playerID = "client_" + time.Now().Format("150405.000")
		}

		role := q.Get("role")
		if role != "GM" {
			role = "PLAYER"
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("Erro no upgrade de WebSocket: %v", err)
			return
		}

		room := roomMgr.GetOrCreateRoom(roomID)
		client := hub.NewClient(room, conn, playerID, role, roomID, cfg)

		room.Register <- client

		go client.WritePump()
		go client.ReadPump()
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Inicia servidor em uma goroutine
	go func() {
		log.Printf(" Servidor de sincronização COMP/CON iniciado na porta :%s (DataDir: %s)", cfg.Port, cfg.DataDir)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Falha crítica no servidor HTTP: %v", err)
		}
	}()

	// Captura sinais do sistema para encerramento gracioso
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println(" Encerrando servidor graciosamente...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_ = server.Shutdown(ctx)
	roomMgr.CloseAll()
	log.Println(" Servidor encerrado com sucesso.")
}
