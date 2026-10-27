package hub

import (
	"encoding/json"
	"log"
	"time"

	"compcon-sync-server/internal/config"
	"compcon-sync-server/internal/models"

	"github.com/gorilla/websocket"
)

// Client representa uma conexão WebSocket ativa vinculada a um jogador e a uma sala.
type Client struct {
	Hub      *RoomHub
	Conn     *websocket.Conn
	Send     chan []byte
	ID       string // PlayerID
	Role     string // "GM" ou "PLAYER"
	RoomID   string
	cfg      *config.Config
}

// NewClient instancia um novo Client com canal de envio bufferizado.
func NewClient(hub *RoomHub, conn *websocket.Conn, id, role, roomID string, cfg *config.Config) *Client {
	return &Client{
		Hub:    hub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		ID:     id,
		Role:   role,
		RoomID: roomID,
		cfg:    cfg,
	}
}

// ReadPump bombeia mensagens do WebSocket para o RoomHub.
// Executa em sua própria goroutine por conexão.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(c.cfg.MaxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(c.cfg.PongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(c.cfg.PongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client %s] Read error: %v", c.ID, err)
			}
			break
		}

		var envelope models.SyncEnvelope
		if err := json.Unmarshal(message, &envelope); err != nil {
			log.Printf("[Client %s] JSON decode error: %v", c.ID, err)
			continue
		}

		// Garante integridade do remetente e timestamp
		envelope.SenderID = c.ID
		envelope.RoomID = c.RoomID
		if envelope.Timestamp == 0 {
			envelope.Timestamp = time.Now().UnixMilli()
		}

		c.Hub.Incoming <- &envelope
	}
}

// WritePump bombeia mensagens do canal Send para a conexão WebSocket.
// Envia pings periódicos para manter o socket vivo.
func (c *Client) WritePump() {
	ticker := time.NewTicker(c.cfg.PingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(c.cfg.WriteWait))
			if !ok {
				// O canal foi fechado pelo hub
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				return
			}

			// Despeja mensagens pendentes na fila no mesmo frame para reduzir overhead
			n := len(c.Send)
			for i := 0; i < n; i++ {
				if _, err := w.Write([]byte{'\n'}); err != nil {
					return
				}
				if _, err := w.Write(<-c.Send); err != nil {
					return
				}
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(c.cfg.WriteWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendEnvelope serializa e enfileira um envelope para envio a este cliente.
func (c *Client) SendEnvelope(env *models.SyncEnvelope) {
	data, err := json.Marshal(env)
	if err != nil {
		log.Printf("[Client %s] Erro ao serializar envelope: %v", c.ID, err)
		return
	}

	select {
	case c.Send <- data:
	default:
		log.Printf("[Client %s] Buffer de envio cheio, mensagem descartada", c.ID)
	}
}
