package hub

import (
	"encoding/json"
	"sync"

	"compcon-sync-server/internal/config"
	"compcon-sync-server/internal/models"
)

// RoomManager gerencia a criação, recuperação e ciclo de vida de salas ativas.
type RoomManager struct {
	rooms   map[string]*RoomHub
	mu      sync.RWMutex
	cfg     *config.Config
	persist func(roomID string, sheets map[string]*models.SheetStateEntry, tracker json.RawMessage) error
	load    func(roomID string) (map[string]*models.SheetStateEntry, json.RawMessage, error)
}

// NewRoomManager cria uma nova instância de gerenciador de salas.
func NewRoomManager(cfg *config.Config) *RoomManager {
	return &RoomManager{
		rooms: make(map[string]*RoomHub),
		cfg:   cfg,
	}
}

// SetStorageHooks conecta as funções de carga e persistência do banco (Fase 2).
func (m *RoomManager) SetStorageHooks(
	persist func(roomID string, sheets map[string]*models.SheetStateEntry, tracker json.RawMessage) error,
	load func(roomID string) (map[string]*models.SheetStateEntry, json.RawMessage, error),
) {
	m.persist = persist
	m.load = load
}

// GetOrCreateRoom obtém uma sala existente ou cria e inicia uma nova goroutine isolada.
func (m *RoomManager) GetOrCreateRoom(roomID string) *RoomHub {
	m.mu.Lock()
	defer m.mu.Unlock()

	if hub, ok := m.rooms[roomID]; ok {
		return hub
	}

	hub := NewRoomHub(roomID, m.cfg)
	hub.PersistFn = m.persist

	// Se houver hook de carga, hidrata o estado inicial a partir do storage
	if m.load != nil {
		if sheets, tracker, err := m.load(roomID); err == nil {
			hub.Sheets = sheets
			hub.ActiveTracker = tracker
		}
	}

	go hub.Run()
	m.rooms[roomID] = hub
	return hub
}

// RoomCount retorna o número de salas ativas na memória.
func (m *RoomManager) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

// CloseAll encerra todas as salas graciosamente.
func (m *RoomManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, hub := range m.rooms {
		hub.Stop()
	}
	m.rooms = make(map[string]*RoomHub)
}
